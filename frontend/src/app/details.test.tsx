import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";
import * as councilStreamModule from "@/lib/councilStream";

vi.mock("@/lib/councilStream", async () => {
  const actual = await vi.importActual<typeof councilStreamModule>("@/lib/councilStream");
  return { ...actual, streamCouncil: vi.fn() };
});

const mockedStreamCouncil = vi.mocked(councilStreamModule.streamCouncil);

function scriptedRunWithTrace() {
  return vi.fn(async (_url: string, _prompt: string, handlers: councilStreamModule.CouncilStreamHandlers) => {
    handlers.onRunStart?.({ models: ["model-a", "model-b"], prompt: "hi" });
    handlers.onTrace?.({ stage: "request_received", ts: 1000 });
    handlers.onTrace?.({ stage: "all_models_dispatched", ts: 1005 });

    handlers.onModelStart?.({ model: "model-a" });
    handlers.onTrace?.({ stage: "model_dispatched", model: "model-a", ts: 1010 });
    handlers.onToken?.({ model: "model-a", token: "hello" });
    handlers.onModelDone?.({ model: "model-a", latency_ms: 100, token_count: 1 });
    handlers.onTrace?.({
      stage: "model_completed",
      model: "model-a",
      ts: 1110,
      detail: { latency_ms: 100, token_count: 1, response_preview: "hello" },
    });

    handlers.onModelStart?.({ model: "model-b" });
    handlers.onTrace?.({ stage: "model_dispatched", model: "model-b", ts: 1012 });
    handlers.onToken?.({ model: "model-b", token: "world" });
    handlers.onModelDone?.({ model: "model-b", latency_ms: 120, token_count: 1 });
    handlers.onTrace?.({
      stage: "model_completed",
      model: "model-b",
      ts: 1132,
      detail: { latency_ms: 120, token_count: 1, response_preview: "world" },
    });

    handlers.onArbiterStart?.();
    handlers.onTrace?.({ stage: "arbiter_invoked", ts: 1140 });
    handlers.onArbiterDone?.({ winner: "model-a", rationale: "best" });
    handlers.onTrace?.({ stage: "arbiter_completed", ts: 1300 });
    handlers.onTrace?.({ stage: "run_complete", ts: 1310 });
    handlers.onDone?.({ results: {} });
  });
}

describe("Details tab", () => {
  beforeEach(() => {
    mockedStreamCouncil.mockReset();
  });

  it("is hidden by default and shows the timeline once opened after a real run", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRunWithTrace());
    render(<Home />);
    const user = userEvent.setup();

    expect(screen.queryByTestId("details-panel")).not.toBeInTheDocument();

    const textarea = screen.getByTestId("prompt-input");
    await user.click(textarea);
    await user.type(textarea, "hello council");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(screen.getByTestId("arbiter-winner")).toBeInTheDocument());

    // Still hidden after the run completes - opt-in only.
    expect(screen.queryByTestId("details-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("details-toggle"));

    await waitFor(() => expect(screen.getByTestId("details-panel")).toBeInTheDocument());
    expect(screen.getByTestId("timeline-row-model-model-a")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-row-model-model-b")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-row-arbiter")).toBeInTheDocument();
  });

  it("exposes collapsible raw per-model payloads inside the details panel", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRunWithTrace());
    render(<Home />);
    const user = userEvent.setup();

    const textarea = screen.getByTestId("prompt-input");
    await user.click(textarea);
    await user.type(textarea, "hello council");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(screen.getByTestId("arbiter-winner")).toBeInTheDocument());

    await user.click(screen.getByTestId("details-toggle"));
    await waitFor(() => expect(screen.getByTestId("details-panel")).toBeInTheDocument());

    const toggles = screen.getAllByTestId(/^payload-toggle-/);
    expect(toggles.length).toBeGreaterThan(0);

    // Payload body is collapsed until clicked.
    const firstToggle = toggles[0];
    await user.click(firstToggle);
    const bodies = screen.getAllByTestId(/^payload-body-/);
    expect(bodies.length).toBeGreaterThan(0);
  });

  it("toggling the details tab does not remove or reset the streaming columns", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRunWithTrace());
    render(<Home />);
    const user = userEvent.setup();

    const textarea = screen.getByTestId("prompt-input");
    await user.click(textarea);
    await user.type(textarea, "hello council");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(screen.getByTestId("arbiter-winner")).toBeInTheDocument());

    // Raw columns are visible (auto-opened on completion in Loop 2 behavior).
    expect(screen.getByTestId("column-model-a")).toHaveTextContent("hello");

    await user.click(screen.getByTestId("details-toggle"));
    await waitFor(() => expect(screen.getByTestId("details-panel")).toBeInTheDocument());

    // Column content is unaffected by opening details.
    expect(screen.getByTestId("column-model-a")).toHaveTextContent("hello");

    await user.click(screen.getByTestId("details-toggle"));
    expect(screen.queryByTestId("details-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("column-model-a")).toHaveTextContent("hello");
  });
});
