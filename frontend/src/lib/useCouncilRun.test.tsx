import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCouncilRun } from "./useCouncilRun";
import * as councilStreamModule from "./councilStream";

// We stub streamCouncil so this suite exercises the hook's state machine
// (streaming status transitions, override persistence) without a network
// dependency - the Loop 1 backend suite already proves the real SSE
// contract against live Ollama models.
vi.mock("./councilStream", async () => {
  const actual = await vi.importActual<typeof councilStreamModule>("./councilStream");
  return { ...actual, streamCouncil: vi.fn() };
});

const mockedStreamCouncil = vi.mocked(councilStreamModule.streamCouncil);

describe("useCouncilRun", () => {
  beforeEach(() => {
    mockedStreamCouncil.mockReset();
  });

  it("reflects per-column streaming/done/error status as events arrive", async () => {
    mockedStreamCouncil.mockImplementation(async (_url, _prompt, handlers) => {
      handlers.onRunStart?.({ models: ["model-a", "model-b"], prompt: "hi" });
      handlers.onModelStart?.({ model: "model-a" });
      handlers.onToken?.({ model: "model-a", token: "Hel" });
      handlers.onToken?.({ model: "model-a", token: "lo" });
      handlers.onModelDone?.({ model: "model-a", latency_ms: 120, token_count: 2 });

      handlers.onModelStart?.({ model: "model-b" });
      handlers.onModelError?.({ model: "model-b", error: "unreachable" });

      handlers.onArbiterStart?.();
      handlers.onArbiterDone?.({ winner: "model-a", rationale: "clear and correct" });
      handlers.onDone?.({ results: {} });
    });

    const { result } = renderHook(() => useCouncilRun());

    act(() => {
      result.current.setPrompt("hi");
    });
    act(() => {
      result.current.submit();
    });

    await waitFor(() => expect(result.current.phase).toBe("done"));

    expect(result.current.columns["model-a"].status).toBe("done");
    expect(result.current.columns["model-a"].text).toBe("Hello");
    expect(result.current.columns["model-b"].status).toBe("error");
    expect(result.current.columns["model-b"].error).toBe("unreachable");
    expect(result.current.arbiter?.winner).toBe("model-a");
    expect(result.current.effectiveWinner).toBe("model-a");
    expect(result.current.isOverridden).toBe(false);
  });

  it("manual override persists across re-render and survives a re-run's data updates", async () => {
    mockedStreamCouncil.mockImplementation(async (_url, _prompt, handlers) => {
      handlers.onRunStart?.({ models: ["model-a", "model-b"], prompt: "hi" });
      handlers.onModelDone?.({ model: "model-a", latency_ms: 100, token_count: 1 });
      handlers.onModelDone?.({ model: "model-b", latency_ms: 100, token_count: 1 });
      handlers.onArbiterDone?.({ winner: "model-a", rationale: "a wins" });
      handlers.onDone?.({ results: {} });
    });

    const { result, rerender } = renderHook(() => useCouncilRun());

    act(() => {
      result.current.setPrompt("hi");
    });
    act(() => {
      result.current.submit();
    });
    await waitFor(() => expect(result.current.phase).toBe("done"));

    // Arbiter picked model-a; user overrides to model-b.
    act(() => {
      result.current.setOverrideWinner("model-b");
    });

    rerender();

    expect(result.current.overrideWinner).toBe("model-b");
    expect(result.current.effectiveWinner).toBe("model-b");
    expect(result.current.isOverridden).toBe(true);

    // Arbiter's own pick is untouched underneath the override.
    expect(result.current.arbiter?.winner).toBe("model-a");
  });

  it("clears override and reverts to arbiter's pick when override is set back to null", async () => {
    mockedStreamCouncil.mockImplementation(async (_url, _prompt, handlers) => {
      handlers.onRunStart?.({ models: ["model-a"], prompt: "hi" });
      handlers.onArbiterDone?.({ winner: "model-a", rationale: "only option" });
      handlers.onDone?.({ results: {} });
    });

    const { result } = renderHook(() => useCouncilRun());
    act(() => {
      result.current.setPrompt("hi");
    });
    act(() => {
      result.current.submit();
    });
    await waitFor(() => expect(result.current.phase).toBe("done"));

    act(() => result.current.setOverrideWinner("model-a"));
    expect(result.current.isOverridden).toBe(true);

    act(() => result.current.setOverrideWinner(null));
    expect(result.current.isOverridden).toBe(false);
    expect(result.current.effectiveWinner).toBe("model-a");
  });

  it("a new submit resets override state from the previous run", async () => {
    mockedStreamCouncil.mockImplementation(async (_url, _prompt, handlers) => {
      handlers.onRunStart?.({ models: ["model-a"], prompt: "hi" });
      handlers.onArbiterDone?.({ winner: "model-a", rationale: "x" });
      handlers.onDone?.({ results: {} });
    });

    const { result } = renderHook(() => useCouncilRun());
    act(() => result.current.setPrompt("hi"));
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.phase).toBe("done"));

    act(() => result.current.setOverrideWinner("model-a"));
    expect(result.current.isOverridden).toBe(true);

    act(() => result.current.submit());
    await waitFor(() => expect(result.current.phase).toBe("done"));

    expect(result.current.isOverridden).toBe(false);
  });
});
