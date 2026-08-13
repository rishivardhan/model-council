"""Concurrent dispatch to the council of Ollama models, plus the arbiter.

Each model is wrapped in an LCEL chain (ChatOllama -> StrOutputParser). The
three chains are fanned out concurrently using asyncio tasks that each drain
the model's own `.astream()` generator and push events onto a shared queue.
This is the RunnableParallel *concurrency shape* applied to streaming: rather
than awaiting a single batched `RunnableParallel.ainvoke()` (which would only
give us final values), we run each branch's astream as its own task so
tokens from all three models can be observed interleaved, in real time, as
they are produced.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import AsyncIterator

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama

from app.config import (
    ARBITER_MODEL,
    ARBITER_TIMEOUT_SECONDS,
    COUNCIL_MODELS,
    MODEL_TIMEOUT_SECONDS,
    OLLAMA_BASE_URL,
)


def make_model(model_name: str, temperature: float = 0.7) -> ChatOllama:
    return ChatOllama(model=model_name, base_url=OLLAMA_BASE_URL, temperature=temperature)


def make_chain(model_name: str):
    """LCEL chain: prompt -> model -> string tokens."""
    prompt = ChatPromptTemplate.from_messages([("human", "{input}")])
    model = make_model(model_name)
    return prompt | model | StrOutputParser()


@dataclass
class ModelResult:
    model: str
    text: str = ""
    ok: bool = True
    error: str | None = None
    started_at: float | None = None
    completed_at: float | None = None
    token_count: int = 0


@dataclass
class CouncilRunResult:
    results: dict[str, ModelResult] = field(default_factory=dict)


async def _stream_one_model(
    model_name: str,
    prompt: str,
    queue: "asyncio.Queue[dict]",
    result_holder: dict[str, ModelResult],
) -> None:
    """Drain one model's token stream, pushing SSE-shaped events onto queue."""
    result = ModelResult(model=model_name, started_at=time.monotonic())
    result_holder[model_name] = result
    chain = make_chain(model_name)

    await queue.put({"event": "model_start", "data": {"model": model_name}})

    try:
        astream = chain.astream({"input": prompt})

        async def _consume():
            async for token in astream:
                if not token:
                    continue
                result.text += token
                result.token_count += 1
                await queue.put(
                    {
                        "event": "token",
                        "data": {"model": model_name, "token": token},
                    }
                )

        await asyncio.wait_for(_consume(), timeout=MODEL_TIMEOUT_SECONDS)
        result.completed_at = time.monotonic()
        await queue.put(
            {
                "event": "model_done",
                "data": {
                    "model": model_name,
                    "latency_ms": round((result.completed_at - result.started_at) * 1000, 1),
                    "token_count": result.token_count,
                },
            }
        )
    except asyncio.TimeoutError:
        result.ok = False
        result.error = f"timed out after {MODEL_TIMEOUT_SECONDS}s"
        result.completed_at = time.monotonic()
        await queue.put(
            {"event": "model_error", "data": {"model": model_name, "error": result.error}}
        )
    except Exception as exc:  # noqa: BLE001 - surface any Ollama/connection failure per-model
        result.ok = False
        result.error = str(exc)
        result.completed_at = time.monotonic()
        await queue.put(
            {"event": "model_error", "data": {"model": model_name, "error": result.error}}
        )


async def run_council_stream(
    prompt: str, models: list[str] | None = None
) -> AsyncIterator[dict]:
    """Dispatch `prompt` to all council models concurrently.

    Yields SSE-shaped dicts ({"event": ..., "data": ...}) as they occur,
    interleaved across models in real arrival order. After all models finish
    (or fail), runs the arbiter and yields its verdict, then a final `done`.
    """
    models = models or COUNCIL_MODELS
    queue: "asyncio.Queue[dict]" = asyncio.Queue()
    result_holder: dict[str, ModelResult] = {}

    yield {"event": "run_start", "data": {"models": models, "prompt": prompt}}

    tasks = [
        asyncio.create_task(_stream_one_model(m, prompt, queue, result_holder)) for m in models
    ]

    async def _wait_all():
        await asyncio.gather(*tasks)

    waiter = asyncio.create_task(_wait_all())

    while not waiter.done() or not queue.empty():
        try:
            item = await asyncio.wait_for(queue.get(), timeout=0.05)
            yield item
        except asyncio.TimeoutError:
            continue

    await waiter  # propagate any unexpected exceptions

    # Arbiter pass, only over models that succeeded.
    successful = {m: r for m, r in result_holder.items() if r.ok and r.text.strip()}

    yield {"event": "arbiter_start", "data": {}}

    if not successful:
        yield {
            "event": "arbiter_done",
            "data": {
                "winner": None,
                "rationale": "All models failed or returned empty output; no verdict possible.",
            },
        }
    else:
        try:
            verdict = await asyncio.wait_for(
                run_arbiter(prompt, successful), timeout=ARBITER_TIMEOUT_SECONDS
            )
            yield {"event": "arbiter_done", "data": verdict}
        except Exception as exc:  # noqa: BLE001
            yield {
                "event": "arbiter_error",
                "data": {"error": str(exc)},
            }

    yield {
        "event": "done",
        "data": {
            "results": {
                m: {
                    "ok": r.ok,
                    "error": r.error,
                    "token_count": r.token_count,
                    "latency_ms": round((r.completed_at - r.started_at) * 1000, 1)
                    if r.completed_at
                    else None,
                }
                for m, r in result_holder.items()
            }
        },
    }


ARBITER_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are an impartial arbiter judging responses from several AI models "
            "to the same prompt. Pick the single best response and explain why in "
            "exactly one concise sentence. Respond in this exact format:\n"
            "WINNER: <model name>\n"
            "RATIONALE: <one sentence>",
        ),
        (
            "human",
            "Original prompt:\n{prompt}\n\nCandidate responses:\n{candidates}\n\n"
            "Judge them and respond in the required format.",
        ),
    ]
)


async def run_arbiter(prompt: str, candidates: dict[str, ModelResult]) -> dict:
    """Run the phi3.5 arbiter over the successful model outputs."""
    candidates_block = "\n\n".join(
        f"=== {name} ===\n{result.text.strip()}" for name, result in candidates.items()
    )

    model = make_model(ARBITER_MODEL, temperature=0.0)
    chain = ARBITER_PROMPT | model | StrOutputParser()

    raw = await chain.ainvoke({"prompt": prompt, "candidates": candidates_block})
    raw = raw.strip()

    winner = None
    rationale = raw
    for line in raw.splitlines():
        line = line.strip()
        if line.upper().startswith("WINNER:"):
            winner = line.split(":", 1)[1].strip()
        elif line.upper().startswith("RATIONALE:"):
            rationale = line.split(":", 1)[1].strip()

    return {"winner": winner, "rationale": rationale, "raw": raw}
