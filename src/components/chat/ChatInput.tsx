"use client";

import type { ChangeEvent, FormEvent } from "react";

type ChatInputProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading?: boolean;
  placeholder?: string;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder,
}: ChatInputProps) {
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, padding: "8px 16px 16px" }}>
        <input
          name="prompt"
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? "Type a message..."}
          disabled={isLoading}
          className="placeholder:text-[rgba(255,255,255,0.3)]"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "rgba(255,255,255,0.8)",
            fontSize: 13,
            padding: "8px 12px",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!value.trim() || isLoading}
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
            borderRadius: 6,
            border: "none",
            padding: "8px 14px",
            fontSize: 13,
            cursor: !value.trim() || isLoading ? "not-allowed" : "pointer",
            opacity: !value.trim() || isLoading ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
