"use client";

import type { ArbiterState } from "@/lib/useCouncilRun";
import { shortLabel } from "@/lib/modelIdentity";
import styles from "./ArbiterBanner.module.css";

interface Props {
  arbiter: ArbiterState | null;
  arbiterError: string | null;
  phase: "idle" | "running" | "arbitrating" | "done";
  effectiveWinner: string | null;
  isOverridden: boolean;
  onClearOverride: () => void;
}

export function ArbiterBanner({
  arbiter,
  arbiterError,
  phase,
  effectiveWinner,
  isOverridden,
  onClearOverride,
}: Props) {
  if (phase === "idle") {
    return (
      <div className={styles.banner} data-testid="arbiter-banner">
        <span className={styles.placeholder}>
          Submit a prompt to see the council&rsquo;s verdict.
        </span>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <div className={styles.banner} data-testid="arbiter-banner">
        <span className={styles.placeholder}>Models are responding...</span>
      </div>
    );
  }

  if (phase === "arbitrating") {
    return (
      <div className={styles.banner} data-testid="arbiter-banner">
        <span className={styles.placeholder}>Arbiter is judging the responses...</span>
      </div>
    );
  }

  if (arbiterError) {
    return (
      <div className={`${styles.banner} ${styles.errorBanner}`} data-testid="arbiter-banner">
        Arbiter error: {arbiterError}
      </div>
    );
  }

  if (!arbiter || !effectiveWinner) {
    return (
      <div className={styles.banner} data-testid="arbiter-banner">
        <span className={styles.placeholder}>No verdict available.</span>
      </div>
    );
  }

  return (
    <div className={styles.banner} data-testid="arbiter-banner">
      <div className={styles.verdictRow}>
        <span className={styles.label}>Verdict</span>
        <span className={styles.winner} data-testid="arbiter-winner">
          {shortLabel(effectiveWinner)}
        </span>
        {isOverridden && (
          <span className={styles.overrideTag} data-testid="override-tag">
            manual override
            <button type="button" onClick={onClearOverride} className={styles.clearBtn}>
              revert (esc)
            </button>
          </span>
        )}
      </div>
      <p className={styles.rationale} data-testid="arbiter-rationale">
        {isOverridden
          ? `You overrode the arbiter's pick (${shortLabel(arbiter.winner ?? "none")}).`
          : arbiter.rationale}
      </p>
    </div>
  );
}
