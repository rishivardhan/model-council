"use client";

import { useEffect } from "react";

export interface KeyboardShortcutHandlers {
  /** cmd/ctrl+K - focus the prompt bar from anywhere */
  onFocusPrompt?: () => void;
  /** cmd/ctrl+Enter - submit the current prompt */
  onSubmit?: () => void;
  /** cmd/ctrl+R (prevented from reloading the page) - re-run last prompt */
  onRerun?: () => void;
  /** cmd/ctrl+1..9 - manually pick a winner by column index */
  onOverride?: (index: number) => void;
  /** Escape - clear manual override, back to arbiter's pick */
  onClearOverride?: () => void;
}

function isMeta(e: KeyboardEvent) {
  return e.metaKey || e.ctrlKey;
}

/** Registers global keyboard shortcuts for the Model Council UI. Attaches to
 * `window` so shortcuts work regardless of what currently has focus (except
 * where the browser reserves the combo, e.g. cmd+K in some browser chrome -
 * we still call preventDefault to claim it whenever possible). */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // cmd/ctrl+K: focus prompt bar
      if (isMeta(e) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onFocusPrompt?.();
        return;
      }

      // cmd/ctrl+Enter: submit
      if (isMeta(e) && e.key === "Enter") {
        e.preventDefault();
        handlers.onSubmit?.();
        return;
      }

      // cmd/ctrl+R: re-run last prompt (block browser reload)
      if (isMeta(e) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handlers.onRerun?.();
        return;
      }

      // cmd/ctrl+1..9: override winner by column index
      if (isMeta(e) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        handlers.onOverride?.(Number(e.key) - 1);
        return;
      }

      // Escape: clear override
      if (e.key === "Escape") {
        handlers.onClearOverride?.();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
