// src/components/voice/VoiceProvider.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useVoiceManager, VoiceState } from "@/hooks/useVoiceManager";

type VoiceContextType = {
  voiceMode: boolean;
  voiceState: VoiceState;
  interimText: string;
  lastFinalTranscript: string | null;
  consumeTranscript: () => void;
  enabled: boolean;
  canUseVoice: boolean;
  toggleVoiceMode: () => void;
  speakResponse: (text: string) => void;
  abort: () => void;
  disableVoiceMode: () => void;
};

const VoiceContext = createContext<VoiceContextType | null>(null);

export function useVoice(): VoiceContextType {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}

type VoiceProviderProps = {
  language: string;
  children: ReactNode;
};

export function VoiceProvider({
  language,
  children,
}: VoiceProviderProps) {
  const voice = useVoiceManager({ language });

  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}
