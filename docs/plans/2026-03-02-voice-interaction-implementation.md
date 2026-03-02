# Voice Interaction v1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add voice input (STT) and voice output (TTS) to OpenSelf chat with browser-first architecture and server-side Whisper fallback.

**Architecture:** Voice is a pure I/O layer — no backend changes to the chat pipeline. Browser Web Speech API is the primary STT path; a server-side faster-whisper container is the fallback for unsupported browsers. TTS uses browser-native SpeechSynthesis. A VoiceProvider React context manages state. Mobile defaults to voice-first (page preview + floating mic). Feature flags gate everything.

**Tech Stack:** Web Speech API, SpeechSynthesis API, `@ricky0123/vad-web` (Silero VAD), faster-whisper (Python/FastAPI), React context, Next.js API route proxy.

**Design doc:** `docs/plans/2026-03-02-voice-interaction-design.md`

---

## Task 1: Feature flags and capability detection

**Files:**
- Create: `src/lib/voice/feature-flags.ts`
- Create: `src/hooks/useCapabilityDetection.ts`
- Create: `tests/evals/voice-feature-flags.test.ts`
- Modify: `.env.example` (add voice flags)

**Step 1: Write the failing tests**

```typescript
// tests/evals/voice-feature-flags.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("voice feature flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("isVoiceEnabled returns false by default", async () => {
    delete process.env.NEXT_PUBLIC_VOICE_ENABLED;
    const { isVoiceEnabled } = await import("@/lib/voice/feature-flags");
    expect(isVoiceEnabled()).toBe(false);
  });

  it("isVoiceEnabled returns true when env is 'true'", async () => {
    process.env.NEXT_PUBLIC_VOICE_ENABLED = "true";
    const { isVoiceEnabled } = await import("@/lib/voice/feature-flags");
    expect(isVoiceEnabled()).toBe(true);
  });

  it("isServerSttEnabled returns false by default", async () => {
    delete process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED;
    const { isServerSttEnabled } = await import("@/lib/voice/feature-flags");
    expect(isServerSttEnabled()).toBe(false);
  });

  it("isServerSttEnabled returns true when env is 'true'", async () => {
    process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED = "true";
    const { isServerSttEnabled } = await import("@/lib/voice/feature-flags");
    expect(isServerSttEnabled()).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/voice-feature-flags.test.ts`
Expected: FAIL — module not found

**Step 3: Implement feature flags**

```typescript
// src/lib/voice/feature-flags.ts

export function isVoiceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_ENABLED === "true";
}

export function isServerSttEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED === "true";
}
```

**Step 4: Implement capability detection hook**

```typescript
// src/hooks/useCapabilityDetection.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isServerSttEnabled } from "@/lib/voice/feature-flags";

export type VoiceCapabilities = {
  webSpeechSTT: boolean;
  speechSynthesis: boolean;
  serverSTT: boolean | null; // null = not checked yet
};

/** Detect browser voice capabilities. serverSTT checked lazily on first call. */
export function useCapabilityDetection(): VoiceCapabilities & { checkServerSTT: () => Promise<boolean> } {
  const [caps, setCaps] = useState<VoiceCapabilities>({
    webSpeechSTT: false,
    speechSynthesis: false,
    serverSTT: null,
  });
  const serverChecked = useRef(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
      const res = await fetch("/api/transcribe/health", { signal: controller.signal });
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
```

**Step 5: Add flags to .env.example**

Add to `.env.example` at the end:
```
# === Voice ===
# NEXT_PUBLIC_VOICE_ENABLED=true
# NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED=true
# STT_SERVICE_URL=http://stt:8080    # Internal URL for STT container
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/evals/voice-feature-flags.test.ts`
Expected: PASS (4 tests)

**Step 7: Commit**

```bash
git add src/lib/voice/feature-flags.ts src/hooks/useCapabilityDetection.ts tests/evals/voice-feature-flags.test.ts .env.example
git commit -m "feat(voice): add feature flags and capability detection"
```

---

## Task 2: STT provider — Web Speech API path

**Files:**
- Create: `src/hooks/useSttProvider.ts`
- Create: `tests/evals/voice-stt-provider.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/evals/voice-stt-provider.test.ts
import { describe, it, expect } from "vitest";

describe("STT provider types", () => {
  it("SttResult has text and isFinal fields", async () => {
    const { isSttResult } = await import("@/hooks/useSttProvider");
    expect(isSttResult({ text: "hello", isFinal: true })).toBe(true);
    expect(isSttResult({ text: "", isFinal: false })).toBe(true);
    expect(isSttResult({ text: 123 })).toBe(false);
    expect(isSttResult(null)).toBe(false);
  });

  it("VoiceSttState enum values are correct", async () => {
    const { VoiceSttState } = await import("@/hooks/useSttProvider");
    expect(VoiceSttState.IDLE).toBe("idle");
    expect(VoiceSttState.LISTENING).toBe("listening");
    expect(VoiceSttState.TRANSCRIBING).toBe("transcribing");
    expect(VoiceSttState.ERROR).toBe("error");
    expect(VoiceSttState.PERMISSION_DENIED).toBe("permission_denied");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/voice-stt-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the STT provider hook**

```typescript
// src/hooks/useSttProvider.ts
"use client";

import { useState, useRef, useCallback } from "react";

export enum VoiceSttState {
  IDLE = "idle",
  LISTENING = "listening",
  TRANSCRIBING = "transcribing",
  ERROR = "error",
  PERMISSION_DENIED = "permission_denied",
}

export type SttResult = { text: string; isFinal: boolean };

export function isSttResult(v: unknown): v is SttResult {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as any).text === "string" &&
    typeof (v as any).isFinal === "boolean"
  );
}

type UseSttProviderOptions = {
  language: string;
  onResult: (result: SttResult) => void;
  onFinalResult: (text: string) => void;
  useServerFallback: boolean;
  serverSttAvailable: boolean;
};

export function useSttProvider({
  language,
  onResult,
  onFinalResult,
  useServerFallback,
  serverSttAvailable,
}: UseSttProviderOptions) {
  const [state, setState] = useState<VoiceSttState>(VoiceSttState.IDLE);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Web Speech API path
  const startWebSpeech = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setState(VoiceSttState.LISTENING);

    recognition.onresult = (event: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      if (interimText) onResult({ text: interimText, isFinal: false });
      if (finalText) {
        onResult({ text: finalText, isFinal: true });
        onFinalResult(finalText.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setState(VoiceSttState.PERMISSION_DENIED);
      } else if (event.error !== "aborted") {
        setState(VoiceSttState.ERROR);
        setTimeout(() => setState(VoiceSttState.IDLE), 3000);
      }
    };

    recognition.onend = () => {
      if (state === VoiceSttState.LISTENING) {
        // Speech ended naturally — nothing to do, onresult already fired
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch {
      setState(VoiceSttState.ERROR);
      return false;
    }
  }, [language, onResult, onFinalResult, state]);

  // Server fallback path (MediaRecorder + VAD + POST /api/transcribe)
  // Implemented in Task 6 — stub for now
  const startServerFallback = useCallback(() => {
    setState(VoiceSttState.ERROR);
    return false;
  }, []);

  const start = useCallback(() => {
    if (state !== VoiceSttState.IDLE) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      startWebSpeech();
    } else if (useServerFallback && serverSttAvailable) {
      startServerFallback();
    } else {
      setState(VoiceSttState.ERROR);
    }
  }, [state, startWebSpeech, startServerFallback, useServerFallback, serverSttAvailable]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(VoiceSttState.IDLE);
  }, []);

  return { sttState: state, startStt: start, stopStt: stop };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/voice-stt-provider.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/hooks/useSttProvider.ts tests/evals/voice-stt-provider.test.ts
git commit -m "feat(voice): add STT provider with Web Speech API path"
```

---

## Task 3: TTS provider — SpeechSynthesis path

**Files:**
- Create: `src/hooks/useTtsProvider.ts`
- Create: `tests/evals/voice-tts-provider.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/evals/voice-tts-provider.test.ts
import { describe, it, expect } from "vitest";

describe("TTS provider types", () => {
  it("TtsState enum values are correct", async () => {
    const { TtsState } = await import("@/hooks/useTtsProvider");
    expect(TtsState.IDLE).toBe("idle");
    expect(TtsState.SPEAKING).toBe("speaking");
    expect(TtsState.ERROR).toBe("error");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/voice-tts-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Implement TTS provider**

```typescript
// src/hooks/useTtsProvider.ts
"use client";

import { useState, useRef, useCallback } from "react";

export enum TtsState {
  IDLE = "idle",
  SPEAKING = "speaking",
  ERROR = "error",
}

type UseTtsProviderOptions = {
  language: string;
  onSpeakingDone?: () => void;
};

export function useTtsProvider({ language, onSpeakingDone }: UseTtsProviderOptions) {
  const [state, setState] = useState<TtsState>(TtsState.IDLE);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string) => {
      if (!window.speechSynthesis || !text.trim()) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;

      utterance.onstart = () => setState(TtsState.SPEAKING);
      utterance.onend = () => {
        setState(TtsState.IDLE);
        onSpeakingDone?.();
      };
      utterance.onerror = (event) => {
        if (event.error !== "canceled") {
          setState(TtsState.ERROR);
          setTimeout(() => setState(TtsState.IDLE), 3000);
        } else {
          setState(TtsState.IDLE);
        }
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [language, onSpeakingDone],
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setState(TtsState.IDLE);
  }, []);

  return { ttsState: state, speak, stopSpeaking };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/voice-tts-provider.test.ts`
Expected: PASS (1 test)

**Step 5: Commit**

```bash
git add src/hooks/useTtsProvider.ts tests/evals/voice-tts-provider.test.ts
git commit -m "feat(voice): add TTS provider with SpeechSynthesis"
```

---

## Task 4: Voice manager hook (state machine)

**Files:**
- Create: `src/hooks/useVoiceManager.ts`
- Create: `tests/evals/voice-manager.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/evals/voice-manager.test.ts
import { describe, it, expect } from "vitest";

describe("VoiceState enum", () => {
  it("has all required states", async () => {
    const { VoiceState } = await import("@/hooks/useVoiceManager");
    expect(VoiceState.IDLE).toBe("idle");
    expect(VoiceState.LISTENING).toBe("listening");
    expect(VoiceState.TRANSCRIBING).toBe("transcribing");
    expect(VoiceState.WAITING).toBe("waiting");
    expect(VoiceState.SPEAKING).toBe("speaking");
    expect(VoiceState.ERROR).toBe("error");
    expect(VoiceState.PERMISSION_DENIED).toBe("permission_denied");
    expect(VoiceState.UNAVAILABLE).toBe("unavailable");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/voice-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement voice manager**

```typescript
// src/hooks/useVoiceManager.ts
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSttProvider, VoiceSttState } from "./useSttProvider";
import { useTtsProvider, TtsState } from "./useTtsProvider";
import { useCapabilityDetection } from "./useCapabilityDetection";
import { isVoiceEnabled } from "@/lib/voice/feature-flags";

export enum VoiceState {
  IDLE = "idle",
  LISTENING = "listening",
  TRANSCRIBING = "transcribing",
  WAITING = "waiting",
  SPEAKING = "speaking",
  ERROR = "error",
  PERMISSION_DENIED = "permission_denied",
  UNAVAILABLE = "unavailable",
}

type UseVoiceManagerOptions = {
  language: string;
  onTranscript: (text: string) => void;
  isAssistantResponding: boolean;
};

export function useVoiceManager({
  language,
  onTranscript,
  isAssistantResponding,
}: UseVoiceManagerOptions) {
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>(VoiceState.IDLE);
  const [interimText, setInterimText] = useState("");
  const voiceModeRef = useRef(false);

  const caps = useCapabilityDetection();
  const enabled = isVoiceEnabled();

  const { speak, stopSpeaking, ttsState } = useTtsProvider({
    language,
    onSpeakingDone: () => {
      if (voiceModeRef.current) {
        setVoiceState(VoiceState.LISTENING);
        startSttInternal();
      } else {
        setVoiceState(VoiceState.IDLE);
      }
    },
  });

  const startSttRef = useRef<() => void>(() => {});

  const { sttState, startStt, stopStt } = useSttProvider({
    language,
    onResult: (result) => {
      if (!result.isFinal) {
        setInterimText(result.text);
      } else {
        setInterimText("");
      }
    },
    onFinalResult: (text) => {
      setVoiceState(VoiceState.WAITING);
      onTranscript(text);
    },
    useServerFallback: !caps.webSpeechSTT,
    serverSttAvailable: caps.serverSTT === true,
  });

  const startSttInternal = useCallback(() => {
    startStt();
  }, [startStt]);

  startSttRef.current = startSttInternal;

  // Sync STT state to voice state
  useEffect(() => {
    if (sttState === VoiceSttState.LISTENING) setVoiceState(VoiceState.LISTENING);
    if (sttState === VoiceSttState.TRANSCRIBING) setVoiceState(VoiceState.TRANSCRIBING);
    if (sttState === VoiceSttState.PERMISSION_DENIED) {
      setVoiceState(VoiceState.PERMISSION_DENIED);
      setVoiceMode(false);
      voiceModeRef.current = false;
    }
    if (sttState === VoiceSttState.ERROR) {
      setVoiceState(VoiceState.ERROR);
    }
  }, [sttState]);

  // When assistant finishes responding and we're in voice mode, speak the response
  // (This is handled externally by ChatPanel calling speakResponse)

  const toggleVoiceMode = useCallback(async () => {
    if (!enabled) return;
    if (voiceMode) {
      // Exit voice mode
      stopStt();
      stopSpeaking();
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceState(VoiceState.IDLE);
      setInterimText("");
    } else {
      // Enter voice mode — check capabilities first
      const hasSTT = caps.webSpeechSTT || (await caps.checkServerSTT());
      if (!hasSTT) {
        setVoiceState(VoiceState.UNAVAILABLE);
        return;
      }
      setVoiceMode(true);
      voiceModeRef.current = true;
      startStt();
    }
  }, [enabled, voiceMode, caps, stopStt, stopSpeaking, startStt]);

  const speakResponse = useCallback(
    (text: string) => {
      if (!voiceModeRef.current || !caps.speechSynthesis) return;
      setVoiceState(VoiceState.SPEAKING);
      speak(text);
    },
    [caps.speechSynthesis, speak],
  );

  const abort = useCallback(() => {
    stopStt();
    stopSpeaking();
    setInterimText("");
    if (voiceModeRef.current) {
      setVoiceState(VoiceState.IDLE);
    }
  }, [stopStt, stopSpeaking]);

  // Disable voice mode when user types
  const disableVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      stopStt();
      stopSpeaking();
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceState(VoiceState.IDLE);
      setInterimText("");
    }
  }, [stopStt, stopSpeaking]);

  return {
    voiceMode,
    voiceState,
    interimText,
    enabled,
    canUseVoice: enabled && (caps.webSpeechSTT || caps.serverSTT === true),
    toggleVoiceMode,
    speakResponse,
    abort,
    disableVoiceMode,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/voice-manager.test.ts`
Expected: PASS (1 test)

**Step 5: Commit**

```bash
git add src/hooks/useVoiceManager.ts tests/evals/voice-manager.test.ts
git commit -m "feat(voice): add voice manager state machine"
```

---

## Task 5: VoiceProvider context + MicButton component

**Files:**
- Create: `src/components/voice/VoiceProvider.tsx`
- Create: `src/components/voice/MicButton.tsx`

**Step 1: Implement VoiceProvider**

```typescript
// src/components/voice/VoiceProvider.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useVoiceManager, VoiceState } from "@/hooks/useVoiceManager";

type VoiceContextType = {
  voiceMode: boolean;
  voiceState: VoiceState;
  interimText: string;
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
  onTranscript: (text: string) => void;
  isAssistantResponding: boolean;
  children: ReactNode;
};

export function VoiceProvider({
  language,
  onTranscript,
  isAssistantResponding,
  children,
}: VoiceProviderProps) {
  const voice = useVoiceManager({ language, onTranscript, isAssistantResponding });

  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}
```

**Step 2: Implement MicButton**

```typescript
// src/components/voice/MicButton.tsx
"use client";

import { useVoice } from "./VoiceProvider";
import { VoiceState } from "@/hooks/useVoiceManager";
import { cn } from "@/lib/utils";

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
    // If in an active state (listening/transcribing/speaking), abort first
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

  const stateLabel: Record<VoiceState, string> = {
    [VoiceState.IDLE]: "Start voice",
    [VoiceState.LISTENING]: "Listening...",
    [VoiceState.TRANSCRIBING]: "Transcribing...",
    [VoiceState.WAITING]: "Thinking...",
    [VoiceState.SPEAKING]: "Speaking...",
    [VoiceState.ERROR]: "Error — tap to retry",
    [VoiceState.PERMISSION_DENIED]: "Mic blocked",
    [VoiceState.UNAVAILABLE]: "Voice unavailable",
  };

  return (
    <button
      onClick={handleClick}
      disabled={voiceState === VoiceState.UNAVAILABLE || voiceState === VoiceState.PERMISSION_DENIED}
      aria-label={stateLabel[voiceState]}
      title={stateLabel[voiceState]}
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
```

**Step 3: Commit**

```bash
git add src/components/voice/VoiceProvider.tsx src/components/voice/MicButton.tsx
git commit -m "feat(voice): add VoiceProvider context and MicButton component"
```

---

## Task 6: Integrate voice into ChatPanel + ChatInput (desktop)

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx:514-582,700-730`
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/layout/SplitView.tsx:500-545`

**Step 1: Update ChatInput to accept MicButton**

Modify `src/components/chat/ChatInput.tsx` — add mic button slot and interim text display:

```typescript
// Replace entire ChatInput.tsx
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
    <form onSubmit={onSubmit} className="flex gap-2 border-t p-4">
      <Input
        name="prompt"
        value={value}
        onChange={onChange}
        placeholder={interimText || placeholder || "Type a message..."}
        className="flex-1"
        disabled={isLoading}
      />
      {micButton}
      <Button type="submit" disabled={!value.trim() || isLoading} size="default">
        Send
      </Button>
    </form>
  );
}
```

**Step 2: Wrap SplitView with VoiceProvider**

In `src/components/layout/SplitView.tsx`, add VoiceProvider around the return. Key changes:

1. Import VoiceProvider and MicButton at top
2. Add state for transcript handling
3. Wrap the `<>...</>` return with `<VoiceProvider>`
4. Pass voice props to ChatPanel

The VoiceProvider needs `onTranscript` — this will call `useChat.append()` inside ChatPanelInner. Since useChat lives in ChatPanelInner, we need to expose an `appendMessage` callback up. The cleanest way: ChatPanelInner reads from VoiceProvider context directly.

**Modify `ChatPanelInner`** in `src/components/chat/ChatPanel.tsx`:

1. Import `useVoice` and `MicButton`
2. In `onFinish` callback (~line 567), add TTS call:
   ```typescript
   // After existing step-exhaustion recovery logic:
   if (voiceRef.current && message.content?.trim()) {
     voice.speakResponse(message.content);
   }
   ```
3. Add `useVoice()` consumption:
   ```typescript
   const voice = useVoice();
   const voiceRef = useRef(voice.voiceMode);
   useEffect(() => { voiceRef.current = voice.voiceMode; }, [voice.voiceMode]);
   ```
4. Wire `voice.disableVoiceMode` to `handleInputChange` (user typing disables voice):
   ```typescript
   const handleTyping = useCallback((e: ChangeEvent<HTMLInputElement>) => {
     voice.disableVoiceMode();
     handleInputChange(e);
   }, [handleInputChange, voice]);
   ```
5. Pass MicButton and interimText to ChatInput:
   ```typescript
   <ChatInput
     value={input}
     onChange={handleTyping}
     onSubmit={handleChatSubmit}
     isLoading={isLoading}
     placeholder={t.typeMessage}
     interimText={voice.voiceMode ? voice.interimText : undefined}
     micButton={voice.enabled ? <MicButton /> : undefined}
   />
   ```

**Step 3: Wrap SplitView return with VoiceProvider**

In `src/components/layout/SplitView.tsx` (~line 500), wrap return:

```typescript
// Add imports at top:
import { VoiceProvider } from "@/components/voice/VoiceProvider";

// In the return, wrap everything:
// Need a ref to append message — use a callback ref pattern
const appendRef = useRef<((text: string) => void) | null>(null);

return (
  <VoiceProvider
    language={language}
    onTranscript={(text) => appendRef.current?.(text)}
    isAssistantResponding={false /* will be wired in ChatPanel */}
  >
    {/* existing JSX */}
  </VoiceProvider>
);
```

Actually, since ChatPanelInner already has `useChat`, the simplest integration is: ChatPanelInner consumes `useVoice()` context and calls `append()` when transcript arrives. Add a `useEffect` in ChatPanelInner:

```typescript
// In ChatPanelInner, after useChat:
const voice = useVoice();

useEffect(() => {
  // This is intentionally empty — transcript handling happens via VoiceProvider.onTranscript
  // which SplitView wires to appendRef
}, []);
```

Wait — cleaner approach. The VoiceProvider's `onTranscript` needs access to `useChat.append()`. Since we can't lift useChat above VoiceProvider, we wire it with a ref callback:

In **SplitView**: VoiceProvider wraps everything. `onTranscript` calls a ref.
In **ChatPanelInner**: on mount, register itself with the ref via a new `onAppendRef` prop.

This is getting complex. **Simplest approach**: ChatPanelInner directly consumes `useVoice` and uses an effect to handle transcript:

```typescript
// In ChatPanelInner:
const voice = useVoice();

// When voice sends a transcript, append it as a message
const pendingTranscriptRef = useRef<string | null>(null);
// VoiceProvider calls onTranscript → sets pendingTranscriptRef → triggers append
```

Actually the cleanest: **Don't use onTranscript callback at all.** Instead, expose a `lastTranscript` + `clearTranscript` from VoiceManager, and have ChatPanelInner watch it:

This is overcomplicating. Let me simplify the integration pattern:

**Final approach:** VoiceProvider is a thin context. ChatPanelInner imports `useVoice()`, and in a `useEffect` watches for final transcripts. The useVoiceManager exposes `lastFinalTranscript` (string) + `consumeTranscript()`. When ChatPanelInner sees a new transcript, it calls `append()` and `consumeTranscript()`.

**Step 4: Add transcript consumption to useVoiceManager**

Add to `src/hooks/useVoiceManager.ts`:
```typescript
const [lastFinalTranscript, setLastFinalTranscript] = useState<string | null>(null);
const transcriptSeq = useRef(0);

// In the onFinalResult callback:
onFinalResult: (text) => {
  setVoiceState(VoiceState.WAITING);
  setLastFinalTranscript(text);
  transcriptSeq.current++;
}

const consumeTranscript = useCallback(() => {
  setLastFinalTranscript(null);
}, []);

// Return: add lastFinalTranscript, consumeTranscript
```

Then in ChatPanelInner:
```typescript
const voice = useVoice();

useEffect(() => {
  if (voice.lastFinalTranscript) {
    append({ role: "user", content: voice.lastFinalTranscript }, { body: { language } });
    voice.consumeTranscript();
  }
}, [voice.lastFinalTranscript]);
```

Where `append` comes from `useChat` — note: `useChat` returns `append` (we need to destructure it). Currently ChatPanel destructures: `messages, input, handleInputChange, handleSubmit, isLoading, reload, setMessages`. Add `append` to the destructure.

**Step 5: Commit**

```bash
git add src/components/chat/ChatInput.tsx src/components/chat/ChatPanel.tsx src/components/layout/SplitView.tsx src/hooks/useVoiceManager.ts
git commit -m "feat(voice): integrate voice into ChatPanel, ChatInput, SplitView (desktop)"
```

---

## Task 7: VoiceOverlay for mobile

**Files:**
- Create: `src/components/voice/VoiceOverlay.tsx`
- Modify: `src/components/layout/SplitView.tsx:519-542` (mobile tabs section)

**Step 1: Implement VoiceOverlay**

```typescript
// src/components/voice/VoiceOverlay.tsx
"use client";

import { useVoice } from "./VoiceProvider";
import { MicButton } from "./MicButton";
import { VoiceState } from "@/hooks/useVoiceManager";

type VoiceOverlayProps = {
  onOpenChat: () => void;
};

export function VoiceOverlay({ onOpenChat }: VoiceOverlayProps) {
  const { voiceMode, voiceState, interimText, enabled } = useVoice();

  if (!enabled) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 pb-6 pt-4 bg-gradient-to-t from-background/90 to-transparent">
      {/* Interim text display */}
      {voiceMode && interimText && (
        <div className="mx-4 rounded-lg bg-background/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
          {interimText}
        </div>
      )}

      {/* State indicator */}
      {voiceMode && voiceState === VoiceState.WAITING && (
        <div className="text-xs text-muted-foreground animate-pulse">
          Thinking...
        </div>
      )}

      {/* Buttons row */}
      <div className="flex items-center gap-4">
        <MicButton size="large" />
        <button
          onClick={onOpenChat}
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-accent"
          aria-label="Open chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Integrate into SplitView mobile**

In `src/components/layout/SplitView.tsx`, modify the mobile Tabs section (~line 519-542):

1. Add state for controlled tab value (currently uses `defaultValue="chat"`, needs to become `defaultValue="preview"` when voice is enabled)
2. Add VoiceOverlay inside the preview TabsContent
3. Wire `onOpenChat` to switch to chat tab

```typescript
// In mobile Tabs:
const [activeTab, setActiveTab] = useState(voiceEnabled ? "preview" : "chat");

<Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-screen flex-col md:hidden">
  <TabsList className="sticky top-0 z-40 w-full rounded-none">
    <TabsTrigger value="chat" className="flex-1">Chat</TabsTrigger>
    <TabsTrigger value="preview" className="flex-1">Preview</TabsTrigger>
  </TabsList>
  <TabsContent value="chat" forceMount className="flex-1 overflow-hidden data-[state=inactive]:hidden">
    {chatDataReady && <ChatPanel ... />}
  </TabsContent>
  <TabsContent value="preview" forceMount className="relative flex-1 overflow-hidden data-[state=inactive]:hidden">
    {previewPane}
    <VoiceOverlay onOpenChat={() => setActiveTab("chat")} />
  </TabsContent>
</Tabs>
```

Note: import `isVoiceEnabled` from feature flags to determine default tab.

**Step 3: Commit**

```bash
git add src/components/voice/VoiceOverlay.tsx src/components/layout/SplitView.tsx
git commit -m "feat(voice): add VoiceOverlay for mobile voice-first UX"
```

---

## Task 8: Server-side STT — transcribe API route

**Files:**
- Create: `src/app/api/transcribe/route.ts`
- Create: `src/app/api/transcribe/health/route.ts`

**Step 1: Implement health check endpoint**

```typescript
// src/app/api/transcribe/health/route.ts
import { NextResponse } from "next/server";

const STT_SERVICE_URL = process.env.STT_SERVICE_URL || "http://stt:8080";

export async function GET() {
  if (process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED !== "true") {
    return NextResponse.json({ available: false }, { status: 503 });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${STT_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return NextResponse.json({ available: true });
    }
    return NextResponse.json({ available: false }, { status: 503 });
  } catch {
    return NextResponse.json({ available: false }, { status: 503 });
  }
}
```

**Step 2: Implement transcribe proxy**

```typescript
// src/app/api/transcribe/route.ts
import { NextRequest, NextResponse } from "next/server";

const STT_SERVICE_URL = process.env.STT_SERVICE_URL || "http://stt:8080";
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB

// Simple in-memory rate limiter (per IP, 10 req/min)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED !== "true") {
    return NextResponse.json({ error: "Voice STT not enabled" }, { status: 503 });
  }

  // Rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Content-Length check
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Audio too large (max 5MB)" }, { status: 413 });
  }

  // Content-Type check
  const contentType = req.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  try {
    // Stream-through to STT service (no tmpfile)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30s timeout

    const body = await req.arrayBuffer();
    const res = await fetch(`${STT_SERVICE_URL}/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text, language: data.language });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ error: "Transcription timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "Voice unavailable" }, { status: 503 });
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/transcribe/route.ts src/app/api/transcribe/health/route.ts
git commit -m "feat(voice): add /api/transcribe proxy route with rate limiting"
```

---

## Task 9: Server-side STT — Docker container

**Files:**
- Create: `docker/stt/Dockerfile`
- Create: `docker/stt/server.py`
- Create: `docker/stt/requirements.txt`

**Step 1: Create requirements.txt**

```
# docker/stt/requirements.txt
faster-whisper==1.1.1
fastapi==0.115.0
uvicorn[standard]==0.32.0
python-multipart==0.0.18
```

**Step 2: Create the FastAPI server**

```python
# docker/stt/server.py
"""Minimal STT server wrapping faster-whisper for OpenSelf voice input."""

import os
import tempfile
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stt")

app = FastAPI(title="OpenSelf STT", docs_url=None, redoc_url=None)

# Lazy model loading
_model = None

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "tiny")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
MODEL_DIR = os.getenv("MODEL_DIR", "/models/whisper")
MAX_AUDIO_DURATION = int(os.getenv("MAX_AUDIO_DURATION", "60"))
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(5 * 1024 * 1024)))


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        logger.info(f"Loading model: {WHISPER_MODEL} (compute={WHISPER_COMPUTE_TYPE}, device={WHISPER_DEVICE})")
        _model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
            download_root=MODEL_DIR,
            cpu_threads=2,
        )
        logger.info("Model loaded successfully")
    return _model


@app.get("/health")
async def health():
    return {"status": "ok", "model": WHISPER_MODEL}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Size check
    content = await file.read()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(413, f"Audio too large ({len(content)} bytes, max {MAX_AUDIO_BYTES})")

    # Write to temp file (faster-whisper needs a file path)
    suffix = ".webm" if "webm" in (file.content_type or "") else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(content)
        tmp.flush()

        model = get_model()
        segments, info = model.transcribe(
            tmp.name,
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 700},
            condition_on_previous_text=False,
        )

        # Check duration
        if info.duration and info.duration > MAX_AUDIO_DURATION:
            raise HTTPException(413, f"Audio too long ({info.duration:.0f}s, max {MAX_AUDIO_DURATION}s)")

        text = " ".join(seg.text.strip() for seg in segments).strip()

    return JSONResponse({"text": text, "language": info.language, "duration": info.duration})


@app.on_event("startup")
async def warmup():
    """Pre-load model on startup."""
    logger.info("Warming up model...")
    try:
        get_model()
    except Exception as e:
        logger.warning(f"Warmup failed (model will load on first request): {e}")
```

**Step 3: Create Dockerfile**

```dockerfile
# docker/stt/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system deps for faster-whisper (ffmpeg for audio decoding)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Create model directory
RUN mkdir -p /models/whisper

EXPOSE 8080

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
```

**Step 4: Commit**

```bash
git add docker/stt/Dockerfile docker/stt/server.py docker/stt/requirements.txt
git commit -m "feat(voice): add faster-whisper STT Docker container"
```

---

## Task 10: Wire server fallback into STT provider

**Files:**
- Modify: `src/hooks/useSttProvider.ts` (replace `startServerFallback` stub)

**Step 1: Implement server fallback with MediaRecorder + VAD**

Replace the `startServerFallback` stub in `useSttProvider.ts`:

```typescript
// In useSttProvider.ts, replace startServerFallback:

const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const streamRef = useRef<MediaStream | null>(null);

const startServerFallback = useCallback(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });
    mediaRecorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      // Cleanup stream
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (chunks.length === 0) {
        setState(VoiceSttState.IDLE);
        return;
      }

      setState(VoiceSttState.TRANSCRIBING);
      const blob = new Blob(chunks, { type: recorder.mimeType });

      // POST to server
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");

      abortRef.current = new AbortController();
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        });
        if (!res.ok) {
          setState(VoiceSttState.ERROR);
          setTimeout(() => setState(VoiceSttState.IDLE), 3000);
          return;
        }
        const data = await res.json();
        if (data.text?.trim()) {
          onResult({ text: data.text.trim(), isFinal: true });
          onFinalResult(data.text.trim());
        } else {
          setState(VoiceSttState.IDLE);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setState(VoiceSttState.IDLE);
        } else {
          setState(VoiceSttState.ERROR);
          setTimeout(() => setState(VoiceSttState.IDLE), 3000);
        }
      }
    };

    setState(VoiceSttState.LISTENING);
    recorder.start();

    // Auto-stop after max duration (60s safety)
    setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, 60_000);

    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      setState(VoiceSttState.PERMISSION_DENIED);
    } else {
      setState(VoiceSttState.ERROR);
    }
    return false;
  }
}, [onResult, onFinalResult]);
```

Also update the `stop` function to handle MediaRecorder cleanup:

```typescript
const stop = useCallback(() => {
  if (recognitionRef.current) {
    recognitionRef.current.abort();
    recognitionRef.current = null;
  }
  if (mediaRecorderRef.current?.state === "recording") {
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  }
  if (streamRef.current) {
    streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  if (abortRef.current) {
    abortRef.current.abort();
    abortRef.current = null;
  }
  setState(VoiceSttState.IDLE);
}, []);
```

**Note on VAD:** For v1, the server fallback uses a simple MediaRecorder with manual start/stop (user taps mic to start, taps again to stop or 60s timeout). VAD via `@ricky0123/vad-web` will be wired in a follow-up task to auto-detect speech end. This keeps v1 simpler while still being functional.

**Step 2: Commit**

```bash
git add src/hooks/useSttProvider.ts
git commit -m "feat(voice): wire server fallback with MediaRecorder in STT provider"
```

---

## Task 11: VAD integration for server fallback auto-stop

**Files:**
- Modify: `package.json` (add `@ricky0123/vad-web`)
- Create: `public/voice/` directory for self-hosted VAD assets
- Modify: `src/hooks/useSttProvider.ts`

**Step 1: Install vad-web**

Run: `npm install @ricky0123/vad-web`

**Step 2: Copy VAD ONNX/WASM assets to public**

Run: `mkdir -p public/voice && cp node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js public/voice/ && cp node_modules/onnxruntime-web/dist/*.wasm public/voice/`

Note: The exact asset paths may vary by version. Check `node_modules/@ricky0123/vad-web/` for the ONNX model file (silero_vad.onnx) and worklet files. Copy them to `public/voice/`.

**Step 3: Update startServerFallback to use VAD**

In `useSttProvider.ts`, enhance the server fallback path:

```typescript
// Import at top (dynamic to avoid SSR issues):
// const { MicVAD } = await import("@ricky0123/vad-web");

// In startServerFallback, after getting the stream:
const { MicVAD } = await import("@ricky0123/vad-web");
const myvad = await MicVAD.new({
  stream,
  positiveSpeechThreshold: 0.8,
  minSpeechFrames: 3,
  preSpeechPadFrames: 10,
  redemptionFrames: 8,
  // Self-hosted assets
  onnxWASMBasePath: "/voice/",
  onSpeechEnd: (audio) => {
    // audio is Float32Array at 16kHz
    // Convert to WAV and POST
    const wavBlob = float32ToWav(audio, 16000);
    // ... send to /api/transcribe
  },
});
myvad.start();
```

This is a more advanced integration. For v1, the manual start/stop from Task 10 is sufficient. The VAD auto-stop can be added as a refinement. Mark this task as **optional for v1**.

**Step 4: Commit**

```bash
git add package.json package-lock.json public/voice/ src/hooks/useSttProvider.ts
git commit -m "feat(voice): add @ricky0123/vad-web for server fallback auto-stop"
```

---

## Task 12: End-to-end integration test

**Files:**
- Create: `tests/evals/voice-integration.test.ts`

**Step 1: Write integration tests**

```typescript
// tests/evals/voice-integration.test.ts
import { describe, it, expect, vi } from "vitest";

describe("voice integration contracts", () => {
  it("feature flags default to false", async () => {
    const { isVoiceEnabled, isServerSttEnabled } = await import("@/lib/voice/feature-flags");
    // Without env vars set, both should be false
    expect(isVoiceEnabled()).toBe(false);
    expect(isServerSttEnabled()).toBe(false);
  });

  it("VoiceState enum has all 8 states", async () => {
    const { VoiceState } = await import("@/hooks/useVoiceManager");
    const states = Object.values(VoiceState);
    expect(states).toContain("idle");
    expect(states).toContain("listening");
    expect(states).toContain("transcribing");
    expect(states).toContain("waiting");
    expect(states).toContain("speaking");
    expect(states).toContain("error");
    expect(states).toContain("permission_denied");
    expect(states).toContain("unavailable");
    expect(states).toHaveLength(8);
  });

  it("SttResult type guard works correctly", async () => {
    const { isSttResult } = await import("@/hooks/useSttProvider");
    expect(isSttResult({ text: "hello", isFinal: true })).toBe(true);
    expect(isSttResult({ text: "hello" })).toBe(false);
    expect(isSttResult(null)).toBe(false);
    expect(isSttResult("string")).toBe(false);
  });

  it("TtsState enum has 3 states", async () => {
    const { TtsState } = await import("@/hooks/useTtsProvider");
    const states = Object.values(TtsState);
    expect(states).toContain("idle");
    expect(states).toContain("speaking");
    expect(states).toContain("error");
    expect(states).toHaveLength(3);
  });
});
```

**Step 2: Run all voice tests**

Run: `npx vitest run tests/evals/voice-*.test.ts`
Expected: PASS (all voice test files)

**Step 3: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests pass + new voice tests pass

**Step 4: Commit**

```bash
git add tests/evals/voice-integration.test.ts
git commit -m "test(voice): add integration contract tests"
```

---

## Task 13: Enable feature flag and manual verification

**Step 1: Add env vars to `.env`**

```
NEXT_PUBLIC_VOICE_ENABLED=true
```

**Step 2: Run dev server**

Run: `npm run dev`

**Step 3: Manual verification checklist**

- [ ] Desktop: MicButton appears in ChatInput between text field and Send
- [ ] Desktop: Tap mic → listening state (pulse animation) → speak → transcript appears → auto-send → assistant responds → TTS reads response
- [ ] Desktop: Tap mic during listening → aborts, returns to idle
- [ ] Desktop: Start typing while in voice mode → voice mode disables
- [ ] Mobile: Preview tab is default
- [ ] Mobile: VoiceOverlay appears with large mic + chat button
- [ ] Mobile: Tap mic → same flow as desktop
- [ ] Mobile: Tap chat button → switches to Chat tab
- [ ] Feature flag off: no mic button visible anywhere

**Step 4: Commit**

```bash
git add .env
git commit -m "feat(voice): enable VOICE_ENABLED flag"
```

---

## Summary of all tasks

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Feature flags + capability detection | 3 new, 1 modify | voice-feature-flags.test.ts |
| 2 | STT provider (Web Speech) | 1 new | voice-stt-provider.test.ts |
| 3 | TTS provider (SpeechSynthesis) | 1 new | voice-tts-provider.test.ts |
| 4 | Voice manager (state machine) | 1 new | voice-manager.test.ts |
| 5 | VoiceProvider + MicButton | 2 new | — |
| 6 | Desktop integration (ChatPanel/ChatInput/SplitView) | 3 modify, 1 modify hook | — |
| 7 | Mobile VoiceOverlay | 1 new, 1 modify | — |
| 8 | Transcribe API route (proxy) | 2 new | — |
| 9 | STT Docker container | 3 new | — |
| 10 | Server fallback wiring | 1 modify | — |
| 11 | VAD for auto-stop (optional v1) | 1 dep, 1 modify | — |
| 12 | Integration tests | 1 new | voice-integration.test.ts |
| 13 | Enable + verify | 1 modify | manual |

**Total new files:** ~15
**Modified files:** ~6
**New tests:** 5 test files
**New dependency:** `@ricky0123/vad-web`
**New Docker service:** `docker/stt/` (faster-whisper)
