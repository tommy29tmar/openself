"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isServerSttEnabled } from "@/lib/voice/feature-flags";

export type VoiceCapabilities = {
  webSpeechSTT: boolean;
  speechSynthesis: boolean;
  serverSTT: boolean | null; // null = not checked yet
};

/** Detect browser voice capabilities. serverSTT checked lazily on first call. */
export function useCapabilityDetection(): VoiceCapabilities & {
  checkServerSTT: () => Promise<boolean>;
} {
  const [caps, setCaps] = useState<VoiceCapabilities>({
    webSpeechSTT: false,
    speechSynthesis: false,
    serverSTT: null,
  });
  const serverChecked = useRef(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setCaps((prev) => ({
      ...prev,
      webSpeechSTT: !!SpeechRecognition,
      speechSynthesis: !!window.speechSynthesis,
    }));
  }, []);

  const checkServerSTT = useCallback(async (): Promise<boolean> => {
    if (serverChecked.current) return caps.serverSTT ?? false;
    if (!isServerSttEnabled()) {
      setCaps((prev) => ({ ...prev, serverSTT: false }));
      serverChecked.current = true;
      return false;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch("/api/transcribe/health", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const available = res.ok;
      setCaps((prev) => ({ ...prev, serverSTT: available }));
      serverChecked.current = true;
      return available;
    } catch {
      setCaps((prev) => ({ ...prev, serverSTT: false }));
      serverChecked.current = true;
      return false;
    }
  }, [caps.serverSTT]);

  return { ...caps, checkServerSTT };
}
