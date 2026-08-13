# Model Council

A local-first dev copilot that dispatches a single prompt to three Ollama
models in parallel, streams each model's tokens live in its own column, and
uses a fourth pass (phi3.5 as arbiter) to score and merge the results into
one verdict.

No cloud calls. Everything runs against a local Ollama daemon.

## Models

- `qwen2.5-coder:3b`
- `qwen2.5-coder:1.5b`
- `phi3.5:latest` (also acts as arbiter)

## Structure

```
backend/    FastAPI + LangChain (LCEL / RunnableParallel), SSE streaming
frontend/   Next.js + TypeScript + React
```

## Running it

Requires [Ollama](https://ollama.com) running locally with the three models
above pulled (`ollama pull qwen2.5-coder:3b`, etc).

**Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Development approach

Built in three gated loops, each with its own test suite run against real
Ollama models (no mocked happy-path responses):

1. **Foundations** — concurrent dispatch, SSE token streaming per model,
   arbiter verdict, graceful degradation on model failure.
2. **UI** — command-first input, live per-model streaming columns with
   token/sec + latency, arbiter verdict up top, keyboard-first interactions,
   manual override of the arbiter's pick.
3. **Details tab** — live LangChain execution trace (dispatch → per-model
   completion → arbiter) rendered as a timeline, without affecting main
   stream latency.

See `backend/tests/` and `frontend/tests/` for what each loop's suite
covers.
