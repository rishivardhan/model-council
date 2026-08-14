# Model Council - build summary

Local-first app that dispatches one prompt concurrently to three Ollama
models, streams tokens per-model over SSE, and uses phi3.5 as an arbiter to
score/merge outputs. Fully offline; no cloud calls at any point.

Built across three gated loops. Every loop's test suite was run against real
Ollama models (qwen2.5-coder:3b, qwen2.5-coder:1.5b, phi3.5:latest) - mocking
was used only for simulating an unreachable model in the graceful-degradation
test, never for a happy path.

Final commits on main (pushed to origin/main):

- 61b96b6 - Loop 1: FastAPI+LangChain concurrent SSE dispatch, phi3.5 arbiter, minimal Next.js UI
- 613cc78 - Loop 2: Tesla-level UI - command-first input, streaming columns, keyboard-first, manual override
- fd757b5 - Loop 3: Details tab - structured LangChain execution trace, timeline, raw payloads

## Loop 1 - Foundations

Backend (backend/app/): FastAPI app exposing GET/POST /api/council/stream.
council.py fans a prompt out to three LCEL chains (ChatOllama pipe
StrOutputParser), one asyncio.Task per model, each draining its own
.astream() generator and pushing SSE-shaped events onto a shared queue as
tokens arrive - genuine concurrent streaming, not a batched
RunnableParallel.ainvoke() that would only yield final values. After all
three finish (or fail), a phi3.5 arbiter chain scores the surviving outputs
and returns a winner plus a one-line rationale. A model that times out or
can't reach Ollama is reported via a model_error event and does not crash
the request; the arbiter still runs over whichever models succeeded.

Frontend (frontend/): minimal Next.js/TypeScript page - one textarea, one
submit button, three raw text columns, plain-text arbiter verdict below.
Zero styling effort, proving plumbing only. SSE parsing logic lives in
src/lib/councilStream.ts, framework-free so it's reusable/testable.

Test suite (backend/tests/test_council.py, pytest-asyncio, real models):
- Concurrency timing - three real model calls run together in well under the
  sum of their solo run times, proving genuine parallel dispatch.
- Incremental streaming - each model emits multiple discrete token events
  with real content, not one final blob.
- Real arbiter verdict - phi3.5 produces an actual winner plus rationale from
  real model completions.
- Graceful degradation - a model pointed at an unreachable endpoint fails on
  its own (model_error), the request still completes, and the other real
  model's tokens still stream.

5/5 tests pass.

## Loop 2 - Tesla-level UI

Rebuilt the frontend interaction:
- Command-first: Ctrl/Cmd+K focuses the prompt bar from anywhere,
  Ctrl/Cmd+Enter submits, Ctrl/Cmd+R re-runs the last prompt, Ctrl/Cmd+1-9
  manually overrides the arbiter's winner by column, Escape reverts to the
  arbiter's own pick.
- Streaming columns (src/components/StreamColumn.tsx) as first-class
  comparison surfaces: token-level streaming, a stable per-model color
  identity (src/lib/modelIdentity.ts), live tokens/sec plus latency shown
  unobtrusively per column while streaming and after completion. Fenced code
  blocks are extracted (src/lib/codeBlocks.ts) and individually copyable.
- Arbiter verdict promoted to a confident single banner up top
  (src/components/ArbiterBanner.tsx); the three raw outputs are collapsed
  by default behind a "Show raw responses" toggle, auto-expanded once a run
  completes.
- Manual override tracked independently of the arbiter's own pick in
  src/lib/useCouncilRun.ts (effectiveWinner = override ?? arbiter.winner),
  so it persists across re-renders and is visibly reflected (winner badge,
  banner text, "manual override" tag) until cleared or a new prompt runs.

No backend contract changes - same SSE event shapes as Loop 1.

Test suite (Vitest + Testing Library - the one standard frontend testing lib
used, no exotic dependencies):
- Keyboard shortcuts trigger the right actions (focus, submit, re-run,
  override by index, clear override).
- Manual override persists across re-render and is reflected in the UI
  (winner badge, banner tag) until reverted or a new run starts.
- Per-column status (idle/streaming/done/error) reflects the real event
  sequence.
- Copying a code block writes to the clipboard.

18/18 tests pass. Loop 1's backend suite was re-run unmodified and still
passes (5/5).

## Loop 3 - Details tab

Backend: every run now additionally emits trace SSE events -
request_received, all_models_dispatched, model_dispatched,
model_completed/model_failed (per model, with response preview, latency,
token count), arbiter_invoked, arbiter_completed/arbiter_failed,
run_complete. Each carries a wall-clock epoch-millisecond timestamp (ts) so
a client can plot genuinely overlapping execution windows - separate from
the monotonic-clock latency math used elsewhere in the code. Purely
additive: no existing event type's shape changed.

Frontend: src/lib/useTrace.ts collects trace events in a state slice
entirely separate from useCouncilRun's streaming-column state, so the
Details panel can mount or unmount without touching the hot token-update
path. src/components/DetailsPanel.tsx renders a waterfall timeline
(src/lib/timeline.ts builds the rows from raw events) showing each model's
dispatch-to-completion window and the arbiter's window, plus collapsible raw
per-event JSON payloads. Hidden by default behind its own "Show details"
toggle, independent of Loop 2's raw-responses toggle.

Bug found and fixed via real-backend testing: parseSSEChunk originally split
frames only on a blank line using \n\n, but sse-starlette (the backend's
actual SSE implementation) emits \r\n line endings - the client was silently
dropping every single event. This surfaced only once a test drove the real
backend end-to-end instead of a mocked streamCouncil; fixed by normalizing
\r\n before splitting, with a regression test added in
src/lib/councilStream.test.ts.

Test suite:
- backend/tests/test_trace.py (real models): every expected trace stage is
  emitted in a real run; model dispatch timestamps are near-simultaneous and
  execution windows provably overlap in wall-clock time (a concurrency
  assertion on real data, not just presence of events); Loop 1's raw event
  shapes are unchanged alongside the new trace events. 3/3 pass (8/8 backend
  total with Loop 1).
- frontend/src/lib/timeline.test.ts - pure unit tests for the
  waterfall-row-building logic.
- frontend/src/app/details.test.tsx - the tab is hidden by default, renders
  a complete timeline after a run, payloads are collapsible, and
  opening/closing it never resets or re-renders the streaming columns'
  content.
- frontend/src/lib/trace.integration.test.ts - spawns the real FastAPI
  backend as a child process against real Ollama models (not a fixture) and
  asserts: the timeline built from a real run is complete and its model rows
  provably overlap; replaying a real captured SSE byte stream through the
  real parser 200 times shows processing trace frames adds under 50ms total
  overhead versus not processing them - no measurable effect on main-stream
  latency.

31/31 frontend tests pass total (18 from Loop 2 plus 13 new). 8/8 backend
tests pass total.

## Dependencies

Only what was pre-approved: FastAPI, LangChain + langchain-ollama,
sse-starlette, pytest + pytest-asyncio, httpx, Next.js, React, TypeScript,
and Vitest + Testing Library (the one standard frontend testing lib chosen,
per the "ask no one, just pick a standard, well-known testing lib"
instruction). No dependency outside that list was introduced.

## What remains as optional stretch work

- The Details timeline is a simple proportional-width waterfall; a
  zoomable/scrubbable timeline (e.g. drag to inspect a specific millisecond
  window) would help on longer runs with many overlapping models.
- No persistence layer - every run's history is lost on page refresh. A
  local (IndexedDB or SQLite-via-backend) run history would let users
  compare past prompts without re-running them.
- The arbiter is a single phi3.5 pass with a fixed rubric; a
  user-configurable rubric (e.g. weight correctness vs. concision
  differently) was out of scope here.
- No support for more than three models or swapping which models are in the
  council at runtime - COUNCIL_MODELS in backend/app/config.py is currently
  a fixed list; making it configurable via the UI would be a natural next
  step.
- Playwright end-to-end browser tests were not added (Vitest + Testing
  Library was chosen as the "one standard lib" per the instructions); a true
  browser-driven E2E pass over the keyboard shortcuts and streaming UI would
  add another layer of confidence beyond the current component-level tests.
