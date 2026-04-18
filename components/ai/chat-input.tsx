"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface ChatInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Extra actions to show below the input */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * ChatInput — the AI query composer bar.
 *
 * Layout:
 *   [>] [input field] [send]
 *   [ADD REF] [HISTORY] ··· CMD+ENTER TO SEND
 *
 * Focus: border transitions to op-silver
 */
function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Query the intelligence layer...",
  disabled = false,
  actions,
  className,
}: ChatInputProps) {
  const [internal, setInternal] = React.useState("");
  const controlled = value !== undefined;
  const text = controlled ? value : internal;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!controlled) setInternal(e.target.value);
    onChange?.(e.target.value);
  };

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit?.(text.trim());
      if (!controlled) setInternal("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      data-slot="chat-input"
      className={cn("border-t border-op-border bg-op-surface p-4", className)}
    >
      {/* Input row */}
      <div className="relative flex items-center border border-op-border bg-op-base transition-colors focus-within:border-op-silver">
        {/* > prefix */}
        <span className="pl-3 pr-2 font-mono font-bold text-op-silver">
          &gt;
        </span>

        <input
          type="text"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 border-none bg-transparent py-3 font-mono text-sm text-op-silver outline-none placeholder:text-op-text-muted disabled:opacity-40"
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="flex items-center pl-2 pr-3 text-op-text-sec transition-colors hover:text-op-silver disabled:opacity-40"
          aria-label="Send query"
        >
          <span className="material-symbols-outlined text-[20px]">send</span>
        </button>
      </div>

      {/* Meta row */}
      <div className="mt-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          {actions ?? (
            <>
              <ChatInputAction icon="attachment" label="ADD REF" />
              <ChatInputAction icon="history" label="HISTORY" />
            </>
          )}
        </div>
        <span className="font-mono text-[10px] text-op-text-muted">
          CMD+ENTER TO SEND
        </span>
      </div>
    </div>
  );
}

interface ChatInputActionProps {
  icon: string;
  label: string;
  onClick?: () => void;
}

function ChatInputAction({ icon, label, onClick }: ChatInputActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 font-mono text-[10px] text-op-text-sec uppercase tracking-wider transition-colors hover:text-op-silver"
    >
      <span className="material-symbols-outlined text-[12px]">{icon}</span>
      {label}
    </button>
  );
}

export { ChatInput, ChatInputAction };
