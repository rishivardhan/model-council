"""Model Council backend: FastAPI app exposing the /api/council/stream SSE endpoint."""

from __future__ import annotations

import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import COUNCIL_MODELS
from app.council import run_council_stream

app = FastAPI(title="Model Council")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    prompt: str


@app.get("/api/health")
async def health():
    return {"status": "ok", "models": COUNCIL_MODELS}


@app.get("/api/council/stream")
async def council_stream(prompt: str):
    """SSE endpoint: dispatches `prompt` to all council models concurrently,
    streaming per-model tokens and arbiter verdict as named SSE events.

    Event types:
      run_start    - {models, prompt}
      model_start  - {model}
      token        - {model, token}
      model_done   - {model, latency_ms, token_count}
      model_error  - {model, error}
      arbiter_start
      arbiter_done - {winner, rationale, raw}
      arbiter_error- {error}
      done         - {results: {model: {ok, error, token_count, latency_ms}}}
    """

    async def event_generator():
        async for item in run_council_stream(prompt):
            yield {
                "event": item["event"],
                "data": json.dumps(item["data"]),
            }

    return EventSourceResponse(event_generator())


@app.post("/api/council/stream")
async def council_stream_post(body: PromptRequest):
    """POST variant taking a JSON body, same event shape as the GET endpoint."""

    async def event_generator():
        async for item in run_council_stream(body.prompt):
            yield {
                "event": item["event"],
                "data": json.dumps(item["data"]),
            }

    return EventSourceResponse(event_generator())
