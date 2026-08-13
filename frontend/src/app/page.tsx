"use client";

import { useRef, useState } from "react";
import { COUNCIL_STREAM_URL } from "@/lib/backend";
import { streamCouncil } from "@/lib/councilStream";

type ModelState = {
  text: string;
  status: "idle" | "streaming" | "done" | "error";
  error?: string;
  latencyMs?: number;
  tokenCount?: number;
};

const EMPTY_STATE: ModelState = { text: "", status: "idle" };

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>({});
  const [arbiter, setArbiter] = useState<{ winner: string | null; rationale: string } | null>(
    null
  );
  const [arbiterError, setArbiterError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit() {
    if (!prompt.trim() || isRunning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setArbiter(null);
    setArbiterError(null);
    setModelStates({});
    setModels([]);
    setIsRunning(true);

    await streamCouncil(
      COUNCIL_STREAM_URL,
      prompt,
      {
        onRunStart: (data) => {
          setModels(data.models);
          const initial: Record<string, ModelState> = {};
          for (const m of data.models) initial[m] = { ...EMPTY_STATE };
          setModelStates(initial);
        },
        onModelStart: (data) => {
          setModelStates((prev) => ({
            ...prev,
            [data.model]: { ...(prev[data.model] ?? EMPTY_STATE), status: "streaming" },
          }));
        },
        onToken: (data) => {
          setModelStates((prev) => ({
            ...prev,
            [data.model]: {
              ...(prev[data.model] ?? EMPTY_STATE),
              status: "streaming",
              text: (prev[data.model]?.text ?? "") + data.token,
            },
          }));
        },
        onModelDone: (data) => {
          setModelStates((prev) => ({
            ...prev,
            [data.model]: {
              ...(prev[data.model] ?? EMPTY_STATE),
              status: "done",
              latencyMs: data.latency_ms,
              tokenCount: data.token_count,
            },
          }));
        },
        onModelError: (data) => {
          setModelStates((prev) => ({
            ...prev,
            [data.model]: {
              ...(prev[data.model] ?? EMPTY_STATE),
              status: "error",
              error: data.error,
            },
          }));
        },
        onArbiterDone: (data) => {
          setArbiter({ winner: data.winner, rationale: data.rationale });
        },
        onArbiterError: (data) => {
          setArbiterError(data.error);
        },
        onDone: () => {
          setIsRunning(false);
        },
        onConnectionError: (err) => {
          setArbiterError(err instanceof Error ? err.message : String(err));
          setIsRunning(false);
        },
      },
      controller.signal
    );

    setIsRunning(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "monospace", maxWidth: 1200, margin: "0 auto" }}>
      <h1>Model Council</h1>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
        placeholder="Ask the council something..."
        data-testid="prompt-input"
      />
      <div style={{ marginTop: 8 }}>
        <button onClick={handleSubmit} disabled={isRunning} data-testid="submit-button">
          {isRunning ? "Running..." : "Submit"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${models.length || 3}, 1fr)`,
          gap: 16,
          marginTop: 24,
        }}
      >
        {models.map((model) => {
          const state = modelStates[model] ?? EMPTY_STATE;
          return (
            <div key={model} data-testid={`column-${model}`} style={{ border: "1px solid #ccc", padding: 8 }}>
              <div>
                <strong>{model}</strong>{" "}
                <span data-testid={`status-${model}`}>[{state.status}]</span>
              </div>
              {state.status === "done" && (
                <div style={{ fontSize: 12, color: "#666" }}>
                  {state.tokenCount} tokens, {state.latencyMs}ms
                </div>
              )}
              {state.status === "error" && (
                <div style={{ color: "red" }}>Error: {state.error}</div>
              )}
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{state.text}</pre>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Arbiter Verdict</h2>
        {arbiterError && <div style={{ color: "red" }}>Arbiter error: {arbiterError}</div>}
        {arbiter && (
          <div data-testid="arbiter-verdict">
            <div>
              Winner: <strong>{arbiter.winner ?? "none"}</strong>
            </div>
            <div>{arbiter.rationale}</div>
          </div>
        )}
      </div>
    </main>
  );
}
