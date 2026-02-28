"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChangeEvent, FormEvent } from "react";

type ChatInputProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading?: boolean;
  placeholder?: string;
};

export function ChatInput({ value, onChange, onSubmit, isLoading, placeholder }: ChatInputProps) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2 border-t p-4">
      <Input
        name="prompt"
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "Type a message..."}
        className="flex-1"
        disabled={isLoading}
      />
      <Button type="submit" disabled={!value.trim() || isLoading} size="default">
        Send
      </Button>
    </form>
  );
}
