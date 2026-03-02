// src/components/voice/MicButton.tsx
"use client";

import { useVoice } from "./VoiceProvider";
import { VoiceState } from "@/hooks/useVoiceManager";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<VoiceState, string> = {
  [VoiceState.IDLE]: "Start voice",
  [VoiceState.LISTENING]: "Listening...",
  [VoiceState.TRANSCRIBING]: "Transcribing...",
  [VoiceState.WAITING]: "Thinking...",
  [VoiceState.SPEAKING]: "Speaking...",
  [VoiceState.ERROR]: "Error — tap to retry",
  [VoiceState.PERMISSION_DENIED]: "Mic blocked",
  [VoiceState.UNAVAILABLE]: "Voice unavailable",
};

type MicButtonProps = {
  size?: "default" | "large";
  className?: string;
};

export function MicButton({ size = "default", className }: MicButtonProps) {
  const { voiceMode, voiceState, enabled, canUseVoice, toggleVoiceMode, abort } = useVoice();

  if (!enabled) return null;

  const isLarge = size === "large";
  const isActive = voiceMode && voiceState !== VoiceState.IDLE;

  const handleClick = () => {
    if (
      voiceState === VoiceState.LISTENING ||
      voiceState === VoiceState.TRANSCRIBING ||
      voiceState === VoiceState.SPEAKING
    ) {
      abort();
      return;
    }
    toggleVoiceMode();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={voiceState === VoiceState.UNAVAILABLE || voiceState === VoiceState.PERMISSION_DENIED}
      aria-label={STATE_LABEL[voiceState]}
      title={STATE_LABEL[voiceState]}
      className={cn(
        "relative flex items-center justify-center rounded-full transition-all",
        isLarge ? "h-14 w-14" : "h-9 w-9",
        // Base styles
        !isActive && "border bg-background/80 text-muted-foreground hover:bg-accent",
        // Active listening — pulsing ring
        voiceState === VoiceState.LISTENING &&
          "border-2 border-red-500 bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
        // Transcribing
        voiceState === VoiceState.TRANSCRIBING &&
          "border-2 border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-950",
        // Waiting
        voiceState === VoiceState.WAITING &&
          "border bg-background/80 text-muted-foreground animate-pulse",
        // Speaking — waveform indicator
        voiceState === VoiceState.SPEAKING &&
          "border-2 border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950",
        // Error
        voiceState === VoiceState.ERROR &&
          "border-2 border-red-500 bg-red-100 text-red-600",
        // Permission denied
        voiceState === VoiceState.PERMISSION_DENIED &&
          "border border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed",
        className,
      )}
    >
      {/* Mic icon */}
      <svg
        aria-hidden="true"
        width={isLarge ? 24 : 16}
        height={isLarge ? 24 : 16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="2" width="6" height="11" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>

      {/* Listening pulse ring */}
      {voiceState === VoiceState.LISTENING && (
        <span className="absolute inset-0 animate-ping rounded-full border-2 border-red-400 opacity-30" />
      )}
    </button>
  );
}
