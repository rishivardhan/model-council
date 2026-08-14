// Parses the Model Council backend's SSE stream (named events + JSON data)
// and reports each event through callbacks. Kept framework-free so it can
// be unit tested and reused by both the Loop-1 and Loop-2 UIs.

export interface RunStartData {
  models: string[];
  prompt: string;
}
export interface ModelStartData {
  model: string;
}
export interface TokenData {
  model: string;
  token: string;
}
export interface ModelDoneData {
  model: string;
  latency_ms: number;
  token_count: number;
}
export interface ModelErrorData {
  model: string;
  error: string;
}
export interface ArbiterDoneData {
  winner: string | null;
  rationale: string;
  raw?: string;
}
export interface ArbiterErrorData {
  error: string;
}
export interface DoneData {
  results: Record<
    string,
    { ok: boolean; error: string | null; token_count: number; latency_ms: number | null }
  >;
}

/** Structured execution trace event (Loop 3, additive). `ts` is wall-clock
 * epoch milliseconds so the Details timeline can plot genuinely overlapping
 * model execution windows. */
export interface TraceData {
  stage: string;
  ts: number;
  model?: string;
  detail?: Record<string, unknown>;
}

export interface CouncilStreamHandlers {
  onRunStart?: (data: RunStartData) => void;
  onModelStart?: (data: ModelStartData) => void;
  onToken?: (data: TokenData) => void;
  onModelDone?: (data: ModelDoneData) => void;
  onModelError?: (data: ModelErrorData) => void;
  onArbiterStart?: () => void;
  onArbiterDone?: (data: ArbiterDoneData) => void;
  onArbiterError?: (data: ArbiterErrorData) => void;
  onDone?: (data: DoneData) => void;
  onTrace?: (data: TraceData) => void;
  onConnectionError?: (error: unknown) => void;
}

/** Parses a raw SSE text stream (as delivered by the fetch body reader) into
 * {event, data} frames. Exported for unit testing without a network layer.
 *
 * SSE frames are separated by a blank line, and per the spec individual
 * lines may be terminated by \n, \r\n, or \r. sse-starlette (the backend's
 * SSE implementation) emits \r\n line endings, so both the frame separator
 * and the per-line split below must tolerate \r. */
export function parseSSEChunk(
  buffer: string
): { frames: { event: string; data: string }[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames: { event: string; data: string }[] = [];
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    frames.push({ event, data: dataLines.join("\n") });
  }

  return { frames, rest };
}

export async function streamCouncil(
  url: string,
  prompt: string,
  handlers: CouncilStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const fullUrl = `${url}?prompt=${encodeURIComponent(prompt)}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      headers: { Accept: "text/event-stream" },
      signal,
    });
  } catch (err) {
    handlers.onConnectionError?.(err);
    return;
  }

  if (!response.ok || !response.body) {
    handlers.onConnectionError?.(new Error(`backend responded ${response.status}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { frames, rest } = parseSSEChunk(buffer);
      buffer = rest;

      for (const frame of frames) {
        dispatchFrame(frame, handlers);
      }
    }
  } catch (err) {
    handlers.onConnectionError?.(err);
  }
}

function dispatchFrame(
  frame: { event: string; data: string },
  handlers: CouncilStreamHandlers
): void {
  let parsed: unknown = {};
  try {
    parsed = frame.data ? JSON.parse(frame.data) : {};
  } catch {
    return;
  }

  switch (frame.event) {
    case "run_start":
      handlers.onRunStart?.(parsed as RunStartData);
      break;
    case "model_start":
      handlers.onModelStart?.(parsed as ModelStartData);
      break;
    case "token":
      handlers.onToken?.(parsed as TokenData);
      break;
    case "model_done":
      handlers.onModelDone?.(parsed as ModelDoneData);
      break;
    case "model_error":
      handlers.onModelError?.(parsed as ModelErrorData);
      break;
    case "arbiter_start":
      handlers.onArbiterStart?.();
      break;
    case "arbiter_done":
      handlers.onArbiterDone?.(parsed as ArbiterDoneData);
      break;
    case "arbiter_error":
      handlers.onArbiterError?.(parsed as ArbiterErrorData);
      break;
    case "done":
      handlers.onDone?.(parsed as DoneData);
      break;
    case "trace":
      handlers.onTrace?.(parsed as TraceData);
      break;
    default:
      break;
  }
}
