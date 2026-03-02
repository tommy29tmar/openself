"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChangeEvent, FormEvent, ReactNode } from "react";

type ChatInputProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading?: boolean;
  placeholder?: string;
  interimText?: string;
  micButton?: ReactNode;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder,
  interimText,
  micButton,
}: ChatInputProps) {
  return (
    <div className="border-t">
      {/* Interim transcription overlay — always visible when present */}
      {interimText && (
        <div className="px-4 pt-2 text-sm italic text-muted-foreground truncate">
          {interimText}
        </div>
      )}
      <form onSubmit={onSubmit} className="flex gap-2 p-4 pt-2">
        <Input
          name="prompt"
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? "Type a message..."}
          className="flex-1"
          disabled={isLoading}
        />
        {micButton}
        <Button type="submit" disabled={!value.trim() || isLoading} size="default">
          Send
        </Button>
      </form>
    </div>
  );
}
