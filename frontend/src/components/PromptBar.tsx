"use client";

import { forwardRef } from "react";
import styles from "./PromptBar.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isRunning: boolean;
}

// Note: cmd/ctrl+Enter submit is handled globally by useKeyboardShortcuts
// (attached to window), so it fires exactly once regardless of what has
// focus. No local keydown handler here to avoid a double-submit.
export const PromptBar = forwardRef<HTMLTextAreaElement, Props>(function PromptBar(
  { value, onChange, onSubmit, isRunning },
  ref
) {
  return (
    <div className={styles.wrap}>
      <textarea
        ref={ref}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ask the council anything... (⌘K to focus, ⌘⏎ to submit)"
        rows={3}
        data-testid="prompt-input"
      />
      <div className={styles.actions}>
        <span className={styles.hint}>
          <kbd>⌘K</kbd> focus · <kbd>⌘⏎</kbd> submit · <kbd>⌘R</kbd> re-run · <kbd>⌘1-3</kbd>{" "}
          override · <kbd>esc</kbd> revert
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isRunning || !value.trim()}
          data-testid="submit-button"
          className={styles.submitBtn}
        >
          {isRunning ? "Running…" : "Ask council"}
        </button>
      </div>
    </div>
  );
});
