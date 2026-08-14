"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PromptBar } from "@/components/PromptBar";
import { ArbiterBanner } from "@/components/ArbiterBanner";
import { StreamColumn } from "@/components/StreamColumn";
import { DetailsPanel } from "@/components/DetailsPanel";
import { useCouncilRun } from "@/lib/useCouncilRun";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useTrace } from "@/lib/useTrace";
import styles from "./page.module.css";

export default function Home() {
  const { events: traceEvents, record: recordTrace, reset: resetTrace } = useTrace();

  const {
    prompt,
    setPrompt,
    models,
    columns,
    arbiter,
    arbiterError,
    phase,
    isRunning,
    submit,
    rerun,
    overrideWinner,
    setOverrideWinner,
    effectiveWinner,
    isOverridden,
    lastSubmittedPrompt,
  } = useCouncilRun({ onTrace: recordTrace, onRunReset: resetTrace });

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useKeyboardShortcuts({
    onFocusPrompt: () => promptRef.current?.focus(),
    onSubmit: submit,
    onRerun: () => {
      if (lastSubmittedPrompt) rerun();
    },
    onOverride: (index) => {
      const model = models[index];
      if (model) setOverrideWinner(model);
    },
    onClearOverride: () => setOverrideWinner(null),
  });

  // Auto-expand raw outputs once a run has finished, still collapsible.
  useEffect(() => {
    if (phase === "done") setRawOpen(true);
  }, [phase]);

  const toggleDetails = useCallback(() => setDetailsOpen((v) => !v), []);

  return (
    <main className={styles.main}>
      <div className={styles.top}>
        <h1 className={styles.h1}>Model Council</h1>
        <PromptBar
          ref={promptRef}
          value={prompt}
          onChange={setPrompt}
          onSubmit={submit}
          isRunning={isRunning}
        />
      </div>

      <ArbiterBanner
        arbiter={arbiter}
        arbiterError={arbiterError}
        phase={phase}
        effectiveWinner={effectiveWinner}
        isOverridden={isOverridden}
        onClearOverride={() => setOverrideWinner(null)}
      />

      <div className={styles.toggleRow}>
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setRawOpen((v) => !v)}
          data-testid="raw-toggle"
        >
          {rawOpen ? "Hide" : "Show"} raw responses ({models.length})
        </button>
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={toggleDetails}
          data-testid="details-toggle"
        >
          {detailsOpen ? "Hide" : "Show"} details
        </button>
      </div>

      {rawOpen && (
        <div
          className={styles.columns}
          data-testid="columns"
          style={{
            gridTemplateColumns: `repeat(${models.length || 3}, 1fr)`,
          }}
        >
          {models.map((model, i) => {
            const column = columns[model];
            if (!column) return null;
            return (
              <StreamColumn
                key={model}
                column={column}
                allModels={models}
                isWinner={effectiveWinner === model}
                columnIndex={i}
              />
            );
          })}
        </div>
      )}

      {detailsOpen && <DetailsPanel events={traceEvents} models={models} />}
    </main>
  );
}
