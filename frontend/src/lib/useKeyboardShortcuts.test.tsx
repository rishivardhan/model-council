import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  it("cmd/ctrl+K triggers onFocusPrompt", async () => {
    const onFocusPrompt = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onFocusPrompt }));

    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");

    expect(onFocusPrompt).toHaveBeenCalledTimes(1);
  });

  it("cmd/ctrl+Enter triggers onSubmit", async () => {
    const onSubmit = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSubmit }));

    const user = userEvent.setup();
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("cmd/ctrl+R triggers onRerun", async () => {
    const onRerun = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onRerun }));

    const user = userEvent.setup();
    await user.keyboard("{Control>}r{/Control}");

    expect(onRerun).toHaveBeenCalledTimes(1);
  });

  it("cmd/ctrl+1 triggers onOverride with index 0", async () => {
    const onOverride = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOverride }));

    const user = userEvent.setup();
    await user.keyboard("{Control>}1{/Control}");

    expect(onOverride).toHaveBeenCalledWith(0);
  });

  it("cmd/ctrl+2 triggers onOverride with index 1", async () => {
    const onOverride = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOverride }));

    const user = userEvent.setup();
    await user.keyboard("{Control>}2{/Control}");

    expect(onOverride).toHaveBeenCalledWith(1);
  });

  it("Escape triggers onClearOverride", async () => {
    const onClearOverride = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onClearOverride }));

    const user = userEvent.setup();
    await user.keyboard("{Escape}");

    expect(onClearOverride).toHaveBeenCalledTimes(1);
  });
});
