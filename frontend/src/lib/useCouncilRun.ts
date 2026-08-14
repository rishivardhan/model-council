"use client";

import { useCallback, useRef, useState } from "react";
import { COUNCIL_STREAM_URL } from "@/lib/backend";
import { streamCouncil, type TraceData } from "@/lib/councilStream";

export type ColumnStatus = "idle" | "streaming" | "done" | "error";

export interface ColumnState {
  model: string;
  text: string;
  status: ColumnStatus;
  error?: string;
  latencyMs?: number;
  tokenCount?: number;
  startedAt?: number;
  /** live tokens/sec, recomputed as tokens arrive while streaming */
  tokensPerSec?: number;
}

export interface ArbiterState {
  winner: string | null;
  rationale: string;
  raw?: string;
}

export type RunPhase = "idle" | "running" | "arbitrating" | "done";

const EMPTY_COLUMN = (model: string): ColumnState => ({ model, text: "", status: "idle" });

export interface UseCouncilRunOptions {
  /** Called for every Loop-3 structured trace event. Delivered via a ref so
   * it never forces the streaming callback identity (and therefore the hot
   * token-update path) to change - passing a new inline function on every
   * render of the caller is safe and does not add re-render overhead to the
   * main streaming columns. */
  onTrace?: (data: TraceData) => void;
  /** Called once at the start of each new run, before any events arrive -
   * use it to clear a previous run's trace events. */
  onRunReset?: () => void;
}

export function useCouncilRun(options: UseCouncilRunOptions = {}) {
  const [prompt, setPrompt] = useState("");
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, ColumnState>>({});
  const [arbiter, setArbiter] = useState<ArbiterState | null>(null);
  const [arbiterError, setArbiterError] = useState<string | null>(null);
  const [phase, setPhase] = useState<RunPhase>("idle");
  /** Manual override of the arbiter's chosen winner. null = no override (use arbiter pick). */
  const [overrideWinner, setOverrideWinner] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const onTraceRef = useRef(options.onTrace);
  onTraceRef.current = options.onTrace;
  const onRunResetRef = useRef(options.onRunReset);
  onRunResetRef.current = options.onRunReset;

  const run = useCallback(async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLastSubmittedPrompt(trimmed);
    setArbiter(null);
    setArbiterError(null);
    setOverrideWinner(null);
    setColumns({});
    setModels([]);
    setPhase("running");
    onRunResetRef.current?.();

    await streamCouncil(
      COUNCIL_STREAM_URL,
      trimmed,
      {
        onRunStart: (data) => {
          setModels(data.models);
          const initial: Record<string, ColumnState> = {};
          for (const m of data.models) initial[m] = EMPTY_COLUMN(m);
          setColumns(initial);
        },
        onModelStart: (data) => {
          setColumns((prev) => ({
            ...prev,
            [data.model]: {
              ...(prev[data.model] ?? EMPTY_COLUMN(data.model)),
              status: "streaming",
              startedAt: performance.now(),
            },
          }));
        },
        onToken: (data) => {
          setColumns((prev) => {
            const col = prev[data.model] ?? EMPTY_COLUMN(data.model);
            const text = col.text + data.token;
            const elapsedSec = col.startedAt ? (performance.now() - col.startedAt) / 1000 : 0;
            const approxTokens = text.split(/\s+/).filter(Boolean).length;
            return {
              ...prev,
              [data.model]: {
                ...col,
                status: "streaming",
                text,
                tokensPerSec: elapsedSec > 0.05 ? approxTokens / elapsedSec : col.tokensPerSec,
              },
            };
          });
        },
        onModelDone: (data) => {
          setColumns((prev) => ({
            ...prev,
            [data.model]: {
              ...(prev[data.model] ?? EMPTY_COLUMN(data.model)),
              status: "done",
              latencyMs: data.latency_ms,
              tokenCount: data.token_count,
              tokensPerSec:
                data.latency_ms > 0 ? data.token_count / (data.latency_ms / 1000) : undefined,
            },
          }));
        },
        onModelError: (data) => {
          setColumns((prev) => ({
            ...prev,
            [data.model]: {
              ...(prev[data.model] ?? EMPTY_COLUMN(data.model)),
              status: "error",
              error: data.error,
            },
          }));
        },
        onArbiterStart: () => {
          setPhase("arbitrating");
        },
        onArbiterDone: (data) => {
          setArbiter({ winner: data.winner, rationale: data.rationale, raw: data.raw });
        },
        onArbiterError: (data) => {
          setArbiterError(data.error);
        },
        onDone: () => {
          setPhase("done");
        },
        onConnectionError: (err) => {
          setArbiterError(err instanceof Error ? err.message : String(err));
          setPhase("done");
        },
        onTrace: (data) => {
          onTraceRef.current?.(data);
        },
      },
      controller.signal
    );

    setPhase((p) => (p === "running" || p === "arbitrating" ? "done" : p));
  }, []);

  const submit = useCallback(() => {
    void run(prompt);
  }, [prompt, run]);

  const rerun = useCallback(() => {
    if (lastSubmittedPrompt) void run(lastSubmittedPrompt);
  }, [lastSubmittedPrompt, run]);

  /** The effective winner: manual override if set, else the arbiter's pick. */
  const effectiveWinner = overrideWinner ?? arbiter?.winner ?? null;
  const isOverridden = overrideWinner !== null;

  return {
    prompt,
    setPrompt,
    models,
    columns,
    arbiter,
    arbiterError,
    phase,
    isRunning: phase === "running" || phase === "arbitrating",
    submit,
    rerun,
    overrideWinner,
    setOverrideWinner,
    effectiveWinner,
    isOverridden,
    lastSubmittedPrompt,
  };
}
