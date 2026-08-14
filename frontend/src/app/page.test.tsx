import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";
import * as councilStreamModule from "@/lib/councilStream";

vi.mock("@/lib/councilStream", async () => {
  const actual = await vi.importActual<typeof councilStreamModule>("@/lib/councilStream");
  return { ...actual, streamCouncil: vi.fn() };
});

const mockedStreamCouncil = vi.mocked(councilStreamModule.streamCouncil);

// Utility to drive a scripted run through the mocked streamCouncil.
function scriptedRun() {
  return vi.fn(async (_url: string, _prompt: string, handlers: any) => {
    handlers.onRunStart?.({ models: ["model-a", "model-b", "model-c"], prompt: "hi" });
    handlers.onModelStart?.({ model: "model-a" });
    handlers.onToken?.({ model: "model-a", token: "```js\nconsole.log(1)\n```" });
    handlers.onModelDone?.({ model: "model-a", latency_ms: 200, token_count: 5 });

    handlers.onModelStart?.({ model: "model-b" });
    handlers.onToken?.({ model: "model-b", token: "hello from b" });
    handlers.onModelDone?.({ model: "model-b", latency_ms: 150, token_count: 3 });

    handlers.onModelStart?.({ model: "model-c" });
    handlers.onModelError?.({ model: "model-c", error: "boom" });

    handlers.onArbiterStart?.();
    handlers.onArbiterDone?.({ winner: "model-a", rationale: "best answer" });
    handlers.onDone?.({ results: {} });
  });
}

describe("Home page", () => {
  beforeEach(() => {
    mockedStreamCouncil.mockReset();
    // jsdom defaults isSecureContext to false; real browsers on localhost/https
    // report true, which is the path our copy helper prefers.
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      configurable: true,
    });
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn() },
        configurable: true,
      });
    }
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  });

  it("cmd+K focuses the prompt textarea from anywhere on the page", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRun());
    render(<Home />);
    const user = userEvent.setup();

    const textarea = screen.getByTestId("prompt-input") as HTMLTextAreaElement;
    expect(textarea).not.toHaveFocus();

    await user.keyboard("{Control>}k{/Control}");

    expect(textarea).toHaveFocus();
  });

  it("submit button and cmd+Enter both trigger a run reflecting streaming -> done per column", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRun());
    render(<Home />);
    const user = userEvent.setup();

    const textarea = screen.getByTestId("prompt-input");
    await user.click(textarea);
    await user.type(textarea, "hello council");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(screen.getByTestId("arbiter-winner")).toBeInTheDocument());

    expect(screen.getByTestId("status-model-a")).toHaveTextContent("done");
    expect(screen.getByTestId("status-model-b")).toHaveTextContent("done");
    expect(screen.getByTestId("error-model-c")).toHaveTextContent("boom");
    expect(screen.getByTestId("arbiter-winner")).toHaveTextContent("model-a");
  });

  it("manual override via cmd+2 updates the verdict banner and persists across re-render", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRun());
    render(<Home />);
    const user = userEvent.setup();

    const textarea = screen.getByTestId("prompt-input");
    await user.click(textarea);
    await user.type(textarea, "hello council");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(screen.getByTestId("arbiter-winner")).toBeInTheDocument());
    expect(screen.getByTestId("arbiter-winner")).toHaveTextContent("model-a");

    // Override to the second column (model-b) via cmd+2.
    await user.keyboard("{Control>}2{/Control}");

    await waitFor(() =>
      expect(screen.getByTestId("arbiter-winner")).toHaveTextContent("model-b")
    );
    expect(screen.getByTestId("override-tag")).toBeInTheDocument();
    expect(screen.getByTestId("winner-badge-model-b")).toBeInTheDocument();

    // Escape reverts to the arbiter's original pick.
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByTestId("arbiter-winner")).toHaveTextContent("model-a")
    );
    expect(screen.queryByTestId("override-tag")).not.toBeInTheDocument();
  });

  it("copies a code block to the clipboard when the copy button is used", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRun());
    render(<Home />);
    const user = userEvent.setup();

    const textarea = screen.getByTestId("prompt-input");
    await user.click(textarea);
    await user.type(textarea, "hello council");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(screen.getByTestId("copy-code-model-a-0")).toBeInTheDocument());

    const copyBtn = screen.getByTestId("copy-code-model-a-0");
    await user.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("console.log(1)\n");
    await waitFor(() => expect(copyBtn).toHaveTextContent("Copied"));
  });

  it("re-run (cmd+R) re-issues the stream for the last submitted prompt", async () => {
    mockedStreamCouncil.mockImplementation(scriptedRun());
    render(<Home />);
    const user = userEvent.setup();

    const textarea = screen.getByTestId("prompt-input");
    await user.click(textarea);
    await user.type(textarea, "hello council");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(screen.getByTestId("arbiter-winner")).toBeInTheDocument());
    expect(mockedStreamCouncil).toHaveBeenCalledTimes(1);

    await user.keyboard("{Control>}r{/Control}");

    await waitFor(() => expect(mockedStreamCouncil).toHaveBeenCalledTimes(2));
    const secondCallPrompt = mockedStreamCouncil.mock.calls[1][1];
    expect(secondCallPrompt).toBe("hello council");
  });
});
