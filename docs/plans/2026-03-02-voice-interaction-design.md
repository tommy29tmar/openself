# Voice Interaction v1 — Design Document

**Date:** 2026-03-02
**Status:** Approved

## Overview

Voice is a first-class modality in OpenSelf. In v1, voice mode is the **default experience on mobile**: the user sees their page full-screen with a floating mic button, speaks to the assistant, hears responses read aloud, and watches the page populate in real time. On desktop, voice integrates into the existing split-view chat input.

## Conceptual Model

**Voice Mode** is a state of the chat, not a separate feature. When the user taps the mic:

1. Enters voice mode — icon changes, listening begins
2. Speaks — STT transcribes to text
3. Text auto-sent via `useChat.append()`
4. Assistant responds — response read aloud via TTS
5. Cycle continues until user taps mic again (exit) or starts typing

Voice mode disengages automatically when the user starts typing.

## Architecture

### Three Independent Layers

```
┌─────────────────────────────────────────────────────┐
│  VOICE MANAGER (client)                             │
│  States: idle → listening → transcribing → waiting  │
│          → speaking → listening (cycle)             │
│  Also: permission_denied, error, unavailable        │
├─────────────────────────────────────────────────────┤
│  STT LAYER                                          │
│  ├─ Primary: Web Speech API (Chrome/Safari)         │
│  └─ Fallback: POST /api/transcribe → whisper        │
├─────────────────────────────────────────────────────┤
│  TTS LAYER                                          │
│  ├─ Primary: SpeechSynthesis API (browser)          │
│  └─ Enhanced: Kokoro.js (WASM, lazy-load)           │
├─────────────────────────────────────────────────────┤
│  VAD LAYER (fallback path only)                     │
│  └─ @ricky0123/vad-web (Silero, ~2MB, self-hosted)  │
└─────────────────────────────────────────────────────┘
```

### State Machine

```
[idle] ──tap mic──→ [listening]
                        │
                   speech end (onend / VAD)
                        │
                   [transcribing]
                        │
                   STT result (text)
                        │
                   auto-send via useChat.append()
                        │
                   [waiting] (assistant streaming)
                        │
                   stream complete (onFinish)
                        │
                   [speaking] (TTS reads response)
                        │
                   TTS finished
                        │
                   [listening] ←── cycle continues
                        │
                  tap mic ──→ [idle] (exit voice mode)

Error states:
  permission_denied  → mic blocked, CTA to browser settings
  error              → generic error, auto-recovery 3s → idle
  unavailable        → no STT available, mic button hidden
```

### Abort/Cancel (tap during any non-idle state)

- `listening` → `SpeechRecognition.abort()` or VAD stop + MediaRecorder stop
- `transcribing` → `AbortController.abort()` on server fetch
- `speaking` → `speechSynthesis.cancel()` or Kokoro audio stop
- All → cleanup, return to `idle`

## STT Design

### Two Paths (no VAD conflict)

**Web Speech path (Chrome/Safari):**
- `SpeechRecognition` manages mic internally
- Events: `onresult` (interim), `onspeechend`/`onend` (final)
- No VAD, no MediaRecorder
- `lang` param set to current chat language (hint, not auto-detect)

**Fallback path (Firefox / unsupported browsers):**
- `@ricky0123/vad-web` opens mic → `onSpeechEnd` → MediaRecorder blob
- `POST /api/transcribe` with audio/webm;codecs=opus
- Whisper auto-detects language

### Capability Detection (lazy, cached)

```typescript
{
  webSpeechSTT: boolean,   // window.SpeechRecognition || window.webkitSpeechRecognition
  speechSynthesis: boolean, // window.speechSynthesis exists
  webGPU: boolean,          // navigator.gpu exists (for Kokoro enhanced)
  serverSTT: boolean,       // checked lazily on first mic tap, timeout 2s, cached
}
```

- If `webSpeechSTT = false` and `serverSTT = false` → mic button hidden
- If `speechSynthesis = false` → voice mode input-only (no TTS)

### Interim vs Final Results

- Web Speech: interim results shown in real-time (input field on desktop, text overlay on mobile)
- Server fallback: no interim, "transcribing..." indicator → final text
- UI handles both without jitter

## TTS Design

### Primary: SpeechSynthesis API (browser-native)
- Zero cost, instant, works offline
- Voice quality varies by OS/browser

### Enhanced: Kokoro.js (lazy-load, opt-in)
- 82M param model, Apache 2.0
- Loaded via npm `kokoro-js`, WASM runtime
- Model (~20-80MB quantized) downloaded on first TTS use, browser-cached
- No server load

### TTS Trigger
- Active only when `voiceMode === true`
- Triggered in `useChat.onFinish` alongside existing step-exhaustion recovery
- Only speaks if `message.content.trim()` is non-empty

## Data Flow

**Principle:** Voice is purely an I/O layer. The backend does not know if the user spoke or typed.

```
Voice: mic → STT → text → useChat.append({ role: "user", content }, { body: { language } })
Text:  keyboard → input → handleSubmit → same useChat flow

Both → POST /api/chat (identical) → streaming response → onFinish → TTS if voiceMode
```

- `useChat.append()` with body override, backend already reads `messages + language` in `route.ts:94`
- `onFinish` in `ChatPanel.tsx:567` extended (not replaced) with TTS call
- Preview SSE (`/api/preview/stream`) already provides live page updates — zero additional work
- **No backend modifications.** Only new endpoint: `POST /api/transcribe` (proxy)

## UX — Mobile

**Default = voice-first.** VoiceOverlay lives inside the existing Preview tab (no third tab).

```
┌───────────────────────────────┐
│                               │
│    PAGE PREVIEW               │
│    (full screen, live SSE)    │
│                               │
│                               │
│                               │
│         ( ● )     💬          │
│          mic     chat         │
└───────────────────────────────┘
```

- 2 tabs: Chat / Preview (unchanged, forceMount preserved)
- VoiceOverlay renders over Preview when voiceMode active
- Tap 💬 → slide to Chat tab, mic button in ChatInput
- Start typing in chat → voiceMode auto-disables

## UX — Desktop

Split view unchanged. MicButton added inline in ChatInput (between input field and Send button).

```
┌──────────────────┬────────────────────────┐
│  CHAT            │  PAGE PREVIEW          │
│  [messages...]   │                        │
│  ┌────────┐ 🎙 📤│                        │
│  │ input  │      │                        │
└──────────────────┴────────────────────────┘
```

In voice mode, input field shows interim transcription text in real-time.

## Components

### New Files

```
src/
  hooks/
    useVoiceManager.ts        # State machine, coordinates STT/TTS
    useSttProvider.ts          # Abstraction: Web Speech ↔ server fallback
    useTtsProvider.ts          # Abstraction: SpeechSynthesis ↔ Kokoro.js
    useCapabilityDetection.ts  # Lazy feature detection, cached
  components/
    voice/
      MicButton.tsx            # Button with visual states + animations
      VoiceOverlay.tsx         # Mobile: page preview + floating mic/chat buttons
      VoiceProvider.tsx        # React context wrapping SplitView
```

### Modified Files

| File | Change |
|------|--------|
| `SplitView.tsx` | Wrap with VoiceProvider. Mobile: VoiceOverlay inside Preview tab |
| `ChatPanel.tsx` | Consume VoiceProvider context. `onFinish`: add TTS call |
| `ChatInput.tsx` | Add MicButton inline (desktop). Show interim text |
| `package.json` | Add `@ricky0123/vad-web` |

### New Backend

```
src/app/api/transcribe/route.ts   # Proxy to STT container
```

Proxy behavior:
- Validate: Content-Type (multipart), Content-Length (≤5MB)
- Rate limit: per session + per IP
- Stream-through FormData to STT container (no tmpfile)
- Duration validation (≤60s): client-side (MediaRecorder) + STT container
- Zero logging of audio payload
- 503 "voice unavailable" when STT container unreachable

## Server-Side STT Container

```
docker/
  stt/
    Dockerfile          # Python 3.11-slim + faster-whisper + CTranslate2
    server.py           # FastAPI: POST /transcribe, GET /health
    requirements.txt    # faster-whisper, fastapi, uvicorn, python-multipart
```

- Image without model (slim). Volume `/models/whisper` (persistent)
- Model downloaded on first boot (warmup)
- Env: `WHISPER_MODEL=tiny` (default), switchable to `small` without rebuild
- Coolify internal network only, not publicly exposed
- Concurrency: 1 uvicorn worker, 2 threads
- Next.js proxies to `http://stt:8080/transcribe`

## VAD Asset Hosting

`@ricky0123/vad-web` ONNX/WASM assets served from `/public/voice/` (self-hosted, no external CDN). Consistent with privacy-first principle.

## Feature Flags

| Flag | Default | Effect |
|------|---------|--------|
| `VOICE_ENABLED` | `false` | Master switch. Mic button visible only if `true` |
| `VOICE_STT_SERVER_FALLBACK_ENABLED` | `false` | Enables `/api/transcribe` fallback path |

Both exposed as `NEXT_PUBLIC_*` env vars for client-side detection.

## Privacy

- Audio is ephemeral: transcribed and discarded, never stored
- Web Speech API (Chrome): audio sent to Google servers (known tradeoff, user opts in by using voice)
- Fallback path: audio processed on self-hosted Whisper container, never leaves infrastructure
- Kokoro.js TTS: fully client-side, no data leaves browser
- VAD assets self-hosted
- No audio logging anywhere in the pipeline

## Decision Summary

| Decision | Choice |
|---|---|
| Default mode mobile | Voice-first (overlay on preview) |
| STT primary | Web Speech API (onresult/onend, no VAD) |
| STT fallback | faster-whisper tiny int8, Python container, internal network |
| VAD | `@ricky0123/vad-web` only in fallback path, self-hosted assets |
| TTS primary | SpeechSynthesis API |
| TTS enhanced | Kokoro.js lazy-load (WASM, browser) |
| Auto-send | Yes, after speech end |
| TTS trigger | Auto in voice mode, silent in text mode |
| Tap in any state | Immediate abort + cleanup → idle |
| Backend changes | None (only new `/api/transcribe` proxy) |
| State management | VoiceProvider React context |
| Mobile layout | 2 tabs (Chat/Preview), VoiceOverlay inside Preview |
| Feature flags | `VOICE_ENABLED`, `VOICE_STT_SERVER_FALLBACK_ENABLED` |
| Deploy | New STT container on Coolify, persistent volume for model |
