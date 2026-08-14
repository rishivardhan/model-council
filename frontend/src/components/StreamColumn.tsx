"use client";

import { useState } from "react";
import type { ColumnState } from "@/lib/useCouncilRun";
import { identityFor, shortLabel } from "@/lib/modelIdentity";
import { extractCodeBlocks, copyToClipboard } from "@/lib/codeBlocks";
import styles from "./StreamColumn.module.css";

interface Props {
  column: ColumnState;
  allModels: string[];
  isWinner: boolean;
  columnIndex: number;
}

export function StreamColumn({ column, allModels, isWinner, columnIndex }: Props) {
  const identity = identityFor(column.model, allModels);
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
  const codeBlocks = extractCodeBlocks(column.text);

  async function handleCopyBlock(index: number, code: string) {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopiedBlock(index);
      setTimeout(() => setCopiedBlock((cur) => (cur === index ? null : cur)), 1500);
    }
  }

  return (
    <section
      className={styles.column}
      data-testid={`column-${column.model}`}
      data-status={column.status}
      style={{ borderColor: identity.color }}
    >
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span
            className={styles.swatch}
            style={{ background: identity.color }}
            aria-hidden="true"
          />
          <span className={styles.modelName}>{shortLabel(column.model)}</span>
          <kbd className={styles.hotkey}>⌘{columnIndex + 1}</kbd>
          {isWinner && (
            <span className={styles.winnerBadge} data-testid={`winner-badge-${column.model}`}>
              Winner
            </span>
          )}
        </div>
        <div className={styles.stats} data-testid={`status-${column.model}`}>
          <StatusPill status={column.status} />
          {column.status === "streaming" && column.tokensPerSec !== undefined && (
            <span className={styles.metric} data-testid={`tokrate-${column.model}`}>
              {column.tokensPerSec.toFixed(1)} tok/s
            </span>
          )}
          {column.status === "done" && (
            <span className={styles.metric} data-testid={`latency-${column.model}`}>
              {column.tokenCount} tok · {column.latencyMs?.toFixed(0)}ms
            </span>
          )}
        </div>
      </header>

      {column.status === "error" ? (
        <div className={styles.error} data-testid={`error-${column.model}`}>
          {column.error}
        </div>
      ) : (
        <pre className={styles.text}>{column.text || (column.status === "idle" ? "" : "")}</pre>
      )}

      {codeBlocks.length > 0 && (
        <div className={styles.codeBlocks}>
          {codeBlocks.map((block, i) => (
            <div key={i} className={styles.codeBlock}>
              <div className={styles.codeBlockHeader}>
                <span>{block.language ?? "code"}</span>
                <button
                  type="button"
                  onClick={() => handleCopyBlock(i, block.code)}
                  data-testid={`copy-code-${column.model}-${i}`}
                >
                  {copiedBlock === i ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className={styles.codeBlockBody}>{block.code}</pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: ColumnState["status"] }) {
  const label =
    status === "idle"
      ? "idle"
      : status === "streaming"
        ? "streaming"
        : status === "done"
          ? "done"
          : "error";
  return <span className={`${styles.pill} ${styles[`pill-${status}`]}`}>{label}</span>;
}
