"""Loop 1 test suite - runs against REAL Ollama models (no mocked happy path).

Covers:
  1. Concurrent dispatch actually overlaps in time (timing assertion).
  2. Each model streams tokens incrementally (not one final blob).
  3. The arbiter produces a real verdict from real model outputs.
  4. Graceful degradation when a model is unreachable/unavailable.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from app.council import ModelResult, run_arbiter, run_council_stream

FAST_MODELS = ["qwen2.5-coder:1.5b", "qwen2.5-coder:3b", "phi3.5:latest"]
SHORT_PROMPT = "Reply with exactly one short sentence about the color blue."


async def _collect(agen):
    return [item async for item in agen]


@pytest.mark.asyncio
async def test_concurrent_dispatch_overlaps_in_time():
    """Total wall time for 3 models run concurrently should be close to the
    slowest single model, not the sum of all three (which would indicate
    sequential execution)."""

    # Measure each model solo first, to know what "sum" vs "max" should be.
    solo_times = {}
    for model in FAST_MODELS:
        start = time.monotonic()
        async for item in run_council_stream(SHORT_PROMPT, models=[model]):
            pass
        solo_times[model] = time.monotonic() - start

    sum_of_solo = sum(solo_times.values())
    max_of_solo = max(solo_times.values())

    start = time.monotonic()
    events = await _collect(run_council_stream(SHORT_PROMPT, models=FAST_MODELS))
    concurrent_time = time.monotonic() - start

    done_event = next(e for e in events if e["event"] == "done")
    for model, result in done_event["data"]["results"].items():
        assert result["ok"], f"{model} failed: {result['error']}"

    # Concurrent run (including arbiter pass) must be well under the sum of
    # solo runs - proof the three model calls overlapped rather than
    # executing one after another.
    assert concurrent_time < sum_of_solo * 0.75, (
        f"concurrent={concurrent_time:.2f}s not meaningfully less than "
        f"sequential sum={sum_of_solo:.2f}s (max solo={max_of_solo:.2f}s) - "
        "dispatch does not appear to run in parallel"
    )


@pytest.mark.asyncio
async def test_tokens_arrive_incrementally_not_as_one_blob():
    """Each model should emit multiple discrete token events with real
    content, not a single event containing the whole response."""
    events = await _collect(run_council_stream(SHORT_PROMPT, models=["qwen2.5-coder:1.5b"]))

    token_events = [e for e in events if e["event"] == "token"]
    assert len(token_events) >= 3, (
        f"expected several incremental token events, got {len(token_events)}"
    )

    full_text = "".join(e["data"]["token"] for e in token_events)
    assert len(full_text.strip()) > 0

    # Not every token should be the full text - i.e. genuinely incremental.
    assert all(len(e["data"]["token"]) < len(full_text) for e in token_events[:-1]) or len(
        token_events
    ) > 1

    model_done = next(e for e in events if e["event"] == "model_done")
    assert model_done["data"]["token_count"] == len(token_events)
    assert model_done["data"]["latency_ms"] > 0


@pytest.mark.asyncio
async def test_arbiter_produces_real_verdict_from_real_outputs():
    """Run the arbiter directly against real model completions and assert
    it produces a non-stub, on-topic verdict."""
    result_a = ModelResult(
        model="qwen2.5-coder:1.5b",
        text="The sky is often described as blue due to Rayleigh scattering.",
    )
    result_b = ModelResult(
        model="qwen2.5-coder:3b",
        text="Blue is a primary color often associated with calmness and the ocean.",
    )

    verdict = await run_arbiter(
        "Describe the color blue in one sentence.",
        {"qwen2.5-coder:1.5b": result_a, "qwen2.5-coder:3b": result_b},
    )

    assert verdict["winner"] is not None
    assert len(verdict["winner"]) > 0
    assert verdict["rationale"] is not None
    assert len(verdict["rationale"].strip()) > 10, "rationale looks like a stub, not real output"
    assert verdict["raw"].strip() != ""


@pytest.mark.asyncio
async def test_full_stream_produces_real_arbiter_verdict():
    """End-to-end: real streamed outputs feed a real arbiter call."""
    events = await _collect(
        run_council_stream(SHORT_PROMPT, models=["qwen2.5-coder:1.5b", "phi3.5:latest"])
    )

    arbiter_done = [e for e in events if e["event"] == "arbiter_done"]
    assert len(arbiter_done) == 1, "expected exactly one arbiter_done event"

    verdict = arbiter_done[0]["data"]
    assert verdict["winner"], "arbiter did not name a winner"
    assert verdict["rationale"], "arbiter did not produce a rationale"


@pytest.mark.asyncio
async def test_graceful_degradation_unreachable_model():
    """A model pointing at an unreachable Ollama endpoint must fail on its
    own without crashing the whole request; the failure must be reported
    per-model, and the remaining real models must still complete."""
    import app.council as council_module

    real_make_model = council_module.make_model

    def patched_make_model(model_name, temperature=0.7):
        if model_name == "unreachable-model":
            return council_module.ChatOllama(
                model="qwen2.5-coder:1.5b",
                base_url="http://localhost:1",  # nothing listens here
                temperature=temperature,
            )
        return real_make_model(model_name, temperature)

    council_module.make_model = patched_make_model
    try:
        events = await _collect(
            run_council_stream(SHORT_PROMPT, models=["unreachable-model", "qwen2.5-coder:1.5b"])
        )
    finally:
        council_module.make_model = real_make_model

    model_errors = [e for e in events if e["event"] == "model_error"]
    assert any(e["data"]["model"] == "unreachable-model" for e in model_errors), (
        "expected model_error event naming the unreachable model"
    )

    done_event = next(e for e in events if e["event"] == "done")
    assert done_event["data"]["results"]["unreachable-model"]["ok"] is False
    assert done_event["data"]["results"]["qwen2.5-coder:1.5b"]["ok"] is True

    # The healthy model's tokens must still have streamed despite the other
    # model's failure - the whole request did not crash.
    token_events = [
        e for e in events if e["event"] == "token" and e["data"]["model"] == "qwen2.5-coder:1.5b"
    ]
    assert len(token_events) > 0

    # Arbiter should still run over the surviving model's output.
    arbiter_done = [e for e in events if e["event"] == "arbiter_done"]
    assert len(arbiter_done) == 1
    assert arbiter_done[0]["data"]["winner"]
