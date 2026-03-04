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
  const { voiceMode, voiceState, enabled, toggleVoiceMode, abort } = useVoice();

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

  const stateStyle = (() => {
    if (voiceState === VoiceState.LISTENING)
      return { background: "#c0392b", color: "#fff", border: "none", boxShadow: "0 0 0 4px rgba(192,57,43,0.25)" };
    if (voiceState === VoiceState.TRANSCRIBING)
      return { background: "rgba(201,169,110,0.9)", color: "#111", border: "none" };
    if (voiceState === VoiceState.WAITING)
      return { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" };
    if (voiceState === VoiceState.SPEAKING)
      return { background: "rgba(255,255,255,0.2)", color: "#fff", border: "none" };
    if (voiceState === VoiceState.ERROR)
      return { background: "#c0392b", color: "#fff", border: "none" };
    if (voiceState === VoiceState.PERMISSION_DENIED)
      return { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.1)" };
    // IDLE
    return { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.15)" };
  })();

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
        voiceState === VoiceState.WAITING && "animate-pulse",
        className,
      )}
      style={stateStyle}
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
