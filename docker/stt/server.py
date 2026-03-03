"""Minimal STT server wrapping faster-whisper for OpenSelf voice input."""

import os
import tempfile
import logging
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from typing import Optional
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stt")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load model on startup."""
    logger.info("Warming up model...")
    try:
        get_model()
    except Exception as e:
        logger.warning(f"Warmup failed (model will load on first request): {e}")
    yield


app = FastAPI(title="OpenSelf STT", docs_url=None, redoc_url=None, lifespan=lifespan)

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


# ISO 639-1 codes accepted by faster-whisper
_ALLOWED_LANGUAGES = {
    "af","ar","az","be","bg","bn","bo","br","bs","ca","cs","cy","da","de",
    "el","en","es","et","eu","fa","fi","fo","fr","gl","gu","ha","hi","hr",
    "ht","hu","hy","id","is","it","ja","jw","ka","kk","km","kn","ko","la",
    "lb","ln","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my",
    "ne","nl","nn","no","oc","pa","pl","ps","pt","ro","ru","sa","sd","si",
    "sk","sl","sn","so","sq","sr","su","sv","sw","ta","te","tg","th","tk",
    "tl","tr","tt","uk","ur","uz","vi","yi","yo","zh",
}


@app.get("/health")
async def health():
    return {"status": "ok", "model": WHISPER_MODEL}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = Form(None)):
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

        # Validate language hint against allowlist
        lang_hint = language.strip().lower() if language else None
        if lang_hint and lang_hint not in _ALLOWED_LANGUAGES:
            logger.warning(f"Unknown language hint '{lang_hint}', ignoring")
            lang_hint = None

        segments, info = model.transcribe(
            tmp.name,
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 700},
            condition_on_previous_text=False,
            language=lang_hint,
        )

        # Check duration
        if info.duration and info.duration > MAX_AUDIO_DURATION:
            raise HTTPException(413, f"Audio too long ({info.duration:.0f}s, max {MAX_AUDIO_DURATION}s)")

        text = " ".join(seg.text.strip() for seg in segments).strip()

    return JSONResponse({"text": text, "language": info.language, "duration": info.duration})


