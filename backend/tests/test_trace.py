"""Loop 3 test suite - structured trace events, run against REAL Ollama models.

Covers:
  1. Trace events are emitted for every stage of a real run.
  2. Trace timestamps genuinely reflect concurrent/overlapping model execution.
  3. Trace is additive - does not affect Loop 1's raw SSE contract.
"""

from __future__ import annotations

import time

import pytest

from app.council import run_council_stream

MODELS = ["qwen2.5-coder:1.5b", "qwen2.5-coder:3b"]
PROMPT = "Reply with exactly one short sentence about rivers."

EXPECTED_STAGES = {
    "request_received",
    "all_models_dispatched",
    "model_dispatched",
    "model_completed",
    "arbiter_invoked",
    "arbiter_completed",
    "run_complete",
}


async def _collect(agen):
    return [item async for item in agen]


@pytest.mark.asyncio
async def test_trace_events_emitted_for_every_stage_of_a_real_run():
    events = await _collect(run_council_stream(PROMPT, models=MODELS))
    trace_events = [e for e in events if e["event"] == "trace"]

    assert len(trace_events) > 0, "expected trace events in a real run"

    stages_seen = {e["data"]["stage"] for e in trace_events}
    missing = EXPECTED_STAGES - stages_seen
    assert not missing, f"missing trace stages: {missing}"

    # Every trace event must carry a wall-clock timestamp.
    for e in trace_events:
        assert "ts" in e["data"] and e["data"]["ts"] > 0

    # model_dispatched / model_completed must be tagged with which model.
    model_dispatched = [e for e in trace_events if e["data"]["stage"] == "model_dispatched"]
    assert {e["data"]["model"] for e in model_dispatched} == set(MODELS)

    model_completed = [e for e in trace_events if e["data"]["stage"] == "model_completed"]
    assert {e["data"]["model"] for e in model_completed} == set(MODELS)

    # model_completed detail should carry real latency/token data, not stubs.
    for e in model_completed:
        assert e["data"]["detail"]["token_count"] > 0
        assert e["data"]["detail"]["latency_ms"] > 0
        assert len(e["data"]["detail"]["response_preview"]) > 0


@pytest.mark.asyncio
async def test_trace_timestamps_reflect_real_overlap_between_models():
    """The two models' dispatch windows should overlap in wall-clock time -
    proof the timeline the UI draws reflects genuine concurrency, not
    sequential execution relabeled with timestamps."""
    events = await _collect(run_council_stream(PROMPT, models=MODELS))
    trace_events = [e for e in events if e["event"] == "trace"]

    dispatched = {
        e["data"]["model"]: e["data"]["ts"]
        for e in trace_events
        if e["data"]["stage"] == "model_dispatched"
    }
    completed = {
        e["data"]["model"]: e["data"]["ts"]
        for e in trace_events
        if e["data"]["stage"] == "model_completed"
    }

    assert set(dispatched.keys()) == set(MODELS)
    assert set(completed.keys()) == set(MODELS)

    # Dispatch timestamps should be nearly simultaneous (within a small
    # window), proving both models were kicked off together rather than
    # one after the other finished.
    dispatch_times = list(dispatched.values())
    dispatch_spread_ms = max(dispatch_times) - min(dispatch_times)
    assert dispatch_spread_ms < 2000, (
        f"model dispatch timestamps spread by {dispatch_spread_ms}ms - "
        "expected near-simultaneous dispatch"
    )

    # At least one model's [dispatched, completed] window must overlap with
    # the other's - i.e. genuine concurrency, not strictly sequential.
    m1, m2 = MODELS
    overlap = min(completed[m1], completed[m2]) - max(dispatched[m1], dispatched[m2])
    assert overlap > 0, (
        f"no overlap between model execution windows: "
        f"{m1}=[{dispatched[m1]}, {completed[m1]}], {m2}=[{dispatched[m2]}, {completed[m2]}]"
    )


@pytest.mark.asyncio
async def test_trace_is_additive_does_not_break_loop1_event_shapes():
    """Loop 1's core event types must retain their original shape alongside
    the new trace events."""
    events = await _collect(run_council_stream(PROMPT, models=MODELS))

    run_start = next(e for e in events if e["event"] == "run_start")
    assert set(run_start["data"].keys()) == {"models", "prompt"}

    token_events = [e for e in events if e["event"] == "token"]
    assert len(token_events) > 0
    for e in token_events:
        assert set(e["data"].keys()) == {"model", "token"}

    model_done = [e for e in events if e["event"] == "model_done"]
    for e in model_done:
        assert {"model", "latency_ms", "token_count"} <= set(e["data"].keys())

    arbiter_done = next(e for e in events if e["event"] == "arbiter_done")
    assert {"winner", "rationale"} <= set(arbiter_done["data"].keys())

    done = next(e for e in events if e["event"] == "done")
    assert "results" in done["data"]
