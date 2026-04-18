import * as React from "react";

import { cn } from "@/lib/utils";

type MessageRole = "user" | "vlm" | "system";

interface ChatMessageProps extends React.ComponentProps<"div"> {
  role: MessageRole;
  timestamp: string;
  sender?: string;
  children: React.ReactNode;
}

/**
 * ChatMessage — a single message bubble in the AI query interface.
 *
 * user  → right-aligned, bg-elevated, active border
 * vlm   → left-aligned, bg-base, default border, icon prefix
 * system → left-aligned, muted, no border
 */
function ChatMessage({
  role,
  timestamp,
  sender,
  children,
  className,
  ...props
}: ChatMessageProps) {
  const isUser = role === "user";

  const metaLabel = isUser
    ? `USER // ${timestamp}`
    : sender
      ? `${sender} // ${timestamp}`
      : `VLM // ${timestamp}`;

  return (
    <div
      data-slot="chat-message"
      data-role={role}
      className={cn(
        "flex w-full flex-col",
        isUser ? "items-end" : "items-start",
        className,
      )}
      {...props}
    >
      {/* Meta label */}
      <div
        className={cn(
          "mb-1 flex items-center gap-1 font-mono text-[10px]",
          isUser ? "text-op-text-sec" : "text-op-silver",
        )}
      >
        {!isUser && (
          <span className="material-symbols-outlined text-[12px]">
            smart_toy
          </span>
        )}
        <span>{metaLabel}</span>
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] border p-3 text-sm",
          isUser
            ? "border-op-border-active bg-op-elevated text-op-silver"
            : role === "system"
              ? "border-transparent bg-transparent text-op-text-sec"
              : "w-full border-op-border bg-op-base font-mono text-op-silver",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * VlmBullet — a single bullet point in a VLM analysis response.
 * variant controls the ">" prefix color.
 */
interface VlmBulletProps extends React.ComponentProps<"div"> {
  variant?: "default" | "warning" | "critical";
}

function VlmBullet({
  variant = "default",
  className,
  children,
  ...props
}: VlmBulletProps) {
  const prefixColor = {
    default: "text-op-silver",
    warning: "text-op-warning",
    critical: "text-op-critical",
  }[variant];

  return (
    <div
      data-slot="vlm-bullet"
      className={cn("flex items-start gap-2", className)}
      {...props}
    >
      <span className={cn("mt-0.5 shrink-0", prefixColor)}>&gt;</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/**
 * VlmDataTable — the inline mini-table for structured VLM output.
 */
interface VlmDataTableProps {
  headers: string[];
  rows: Array<{
    cells: React.ReactNode[];
    variant?: "default" | "warning" | "critical";
  }>;
}

function getCellKeyPart(cell: React.ReactNode): string {
  if (typeof cell === "string" || typeof cell === "number") {
    return String(cell);
  }

  if (typeof cell === "boolean") {
    return cell ? "true" : "false";
  }

  if (cell === null || cell === undefined) {
    return "empty";
  }

  if (React.isValidElement(cell) && cell.key != null) {
    return String(cell.key);
  }

  return "node";
}

function VlmDataTable({ headers, rows }: VlmDataTableProps) {
  return (
    <div className="mt-4 w-full border border-op-border">
      {/* Header row */}
      <div
        style={{ gridTemplateColumns: `repeat(${headers.length}, 1fr)` }}
        className="grid border-b border-op-border bg-op-elevated p-2 font-mono text-[10px] text-op-text-sec"
      >
        {headers.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>

      {/* Data rows */}
      {rows.map((row) => {
        const valueColor = {
          default: "text-op-silver",
          warning: "text-op-warning",
          critical: "text-op-critical",
        }[row.variant ?? "default"];
        const rowKey = `${row.variant ?? "default"}:${row.cells
          .map(getCellKeyPart)
          .join("|")}`;

        return (
          <div
            key={rowKey}
            style={{ gridTemplateColumns: `repeat(${headers.length}, 1fr)` }}
            className="grid border-b border-op-border p-2 font-mono text-[11px] last:border-b-0 hover:bg-op-elevated"
          >
            {row.cells.map((cell, ci) => (
              <div
                key={`${headers[ci] ?? "cell"}:${getCellKeyPart(cell)}`}
                className={ci === row.cells.length - 1 ? valueColor : ""}
              >
                {cell}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * AggregateConfidence — the "AGGREGATE CONFIDENCE: ██████ 93%" bar.
 */
function AggregateConfidence({ value }: { value: number }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <span className="font-mono text-[10px] text-op-text-sec">
        AGGREGATE CONFIDENCE
      </span>
      <div className="h-0.5 flex-1 bg-op-text-muted">
        <div className="h-full bg-op-silver" style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-[10px] text-op-silver">{value}%</span>
    </div>
  );
}

export { ChatMessage, VlmBullet, VlmDataTable, AggregateConfidence };
