from __future__ import annotations

import asyncio
import json
import os
import shutil
import socket
import subprocess
import time
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from agent.nova_agent import AmazonNovaAgent
from api.schemas import (
    AWSCredentialsPayload,
    AvatarSettings,
    CommandRequest,
    CommandResponse,
    DeviceInfo,
    DevicePairDiscoveredRequest,
    DevicePairRequest,
    GenerationImageResponse,
    GenerationRequest,
    GenerationVideoResponse,
    GestureEventRequest,
    LiveStreamRequest,
    SignEventRequest,
    SignPredictRequest,
    SignTrainRequest,
    TrainGestureRequest,
    TransferLinkRequest,
)
from cloud.aws.s3_client import S3StorageClient
from gesture.mediapipe_engine import map_gesture_to_action
from gesture.sign_classifier import predict_sign, train_sign, bulk_train, get_vocabulary, get_sign_action, get_user_sign_stats
from memory.memory_store import (
    get_personal_memory,
    get_latest_context_payload,
    init_memory,
    list_gestures,
    delete_gesture,
    save_context_transfer,
    save_gesture,
    set_personal_preference,
    get_all_devices,
    upsert_device,
    remove_device,
    set_device_online,
    device_heartbeat,
)
from tools.automation_controller import execute_for_device
from automation.mobile.device_health import mobile_reliability_check
from security.audit import init_audit, log_audit
from security.guards import resolve_user_id
from tools.context_continuation import continue_context_on_device
from tools.action_tools import TOOLBOX, add_note, get_notes, _notes_store
from automation.nova_act_engine import NovaActEngine
from voice.nova_sonic import NovaVoiceSonic

app = FastAPI(title="OmniAccess API", version="0.1.0")

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]
allow_origin_regex = os.getenv(
    "ALLOWED_ORIGIN_REGEX",
    r"^(https?://(localhost|127\.0\.0\.1)(:\d+)?|capacitor://localhost|ionic://localhost)$",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = AmazonNovaAgent()
storage_client = S3StorageClient()
nova_act_engine = NovaActEngine()
nova_sonic_engine = NovaVoiceSonic()

# Default devices are seeded into SQLite on startup (see on_startup)


from security.cloudwatch_logs import setup_cloudwatch_logging

@app.on_event("startup")
def on_startup() -> None:
    init_memory()
    init_audit()
    # setup_cloudwatch_logging()  # Disabled for local stability; enable in production with valid AWS credentials.
    # Seed default devices if the DB is empty
    if not get_all_devices():
        upsert_device("desktop-1", "Work Laptop", "desktop", online=True)
        upsert_device("phone-1", "Android Phone", "mobile", online=True)


@app.middleware("http")
async def security_and_audit_middleware(request: Request, call_next):
    start = time.perf_counter()
    user_id = resolve_user_id(request)
    principal = f"{user_id}:{request.client.host if request.client else 'unknown'}"

    response = await call_next(request)
    duration_ms = int((time.perf_counter() - start) * 1000)
    log_audit(user_id, principal, request.method, request.url.path, response.status_code, duration_ms)
    return response


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "OmniAccess API"}


# ── App Usage Tracking ──────────────────────────────────────────────
_usage_store: dict[str, dict] = {}


@app.get("/api/usage/stats")
def usage_stats(request: Request) -> dict:
    user_id = resolve_user_id(request)
    data = _usage_store.get(user_id, {})
    return {
        "features": data.get("features", [
            {"name": "Voice Commands", "time_ms": 0, "count": 0, "icon": "mic"},
            {"name": "Gesture Control", "time_ms": 0, "count": 0, "icon": "hand"},
            {"name": "Device Automation", "time_ms": 0, "count": 0, "icon": "device"},
            {"name": "Sign Language", "time_ms": 0, "count": 0, "icon": "sign"},
            {"name": "Settings", "time_ms": 0, "count": 0, "icon": "settings"},
        ]),
        "sessions": data.get("sessions", []),
    }


@app.post("/api/usage/track")
def usage_track(request: Request, payload: dict) -> dict:
    user_id = resolve_user_id(request)
    if user_id not in _usage_store:
        _usage_store[user_id] = {"features": [], "sessions": []}

    event_type = payload.get("type", "")
    if event_type == "session":
        sessions = _usage_store[user_id].setdefault("sessions", [])
        session = {
            "id": payload.get("id", str(uuid.uuid4())),
            "startedAt": payload.get("startedAt"),
            "endedAt": payload.get("endedAt"),
            "duration_ms": payload.get("duration_ms", 0),
        }
        existing = next((s for s in sessions if s["id"] == session["id"]), None)
        if existing:
            existing.update(session)
        else:
            sessions.insert(0, session)
        _usage_store[user_id]["sessions"] = sessions[:30]
    elif event_type == "feature":
        features = _usage_store[user_id].setdefault("features", [])
        name = payload.get("name", "")
        feat = next((f for f in features if f["name"] == name), None)
        if feat:
            feat["time_ms"] = feat.get("time_ms", 0) + payload.get("time_ms", 0)
            feat["count"] = feat.get("count", 0) + payload.get("count", 1)
        else:
            features.append({
                "name": name,
                "time_ms": payload.get("time_ms", 0),
                "count": payload.get("count", 1),
                "icon": payload.get("icon", ""),
            })

    return {"ok": True}


@app.get("/api/models/nova")
def nova_models_status() -> dict:
    return {
        "ok": True,
        "models": {
            "nova_lite": getattr(agent, "model_id", None),
            "nova_sonic": getattr(nova_sonic_engine, "model_id", None),
            "nova_act": getattr(nova_act_engine, "model_id", None),
        },
        "model_catalog": {
            "nova_2_lite": {"id": "amazon.nova-lite-v2:0", "description": "Fast reasoning, 1M context, code interpreter, web grounding, MCP tools"},
            "nova_2_pro": {"id": "amazon.nova-pro-v2:0", "description": "Higher capability model (Preview)"},
            "nova_2_omni": {"id": "amazon.nova-omni-v2:0", "description": "Unified multimodal: text/image/video/speech (Preview)"},
            "nova_2_sonic": {"id": "amazon.nova-sonic-v2:0", "description": "Speech-to-speech bidirectional streaming"},
            "nova_multimodal_embedding": {"id": "amazon.nova-multimodal-embedding-v1:0", "description": "Cross-modal embeddings"},
            "nova_act": {"id": "amazon.nova-act-v1:0", "description": "Browser UI automation (GA)"},
        },
    }


# ── Universal Task Execution Engine ────────────────────────────
@app.post("/api/task/execute")
async def task_execute(request: Request) -> dict:
    """Universal task execution endpoint — handles any user command from any modality."""
    user_id = resolve_user_id(request)
    payload = await request.json()
    text = str(payload.get("text", "")).strip()
    modality = payload.get("modality", "text")
    device_id = payload.get("device_id", "desktop-1")
    language = payload.get("language", "en-US")

    if not text:
        return {"ok": False, "error": "No command text provided"}

    # Run through agent: get both a response and tool plan
    result = agent.run(text, device_id, user_id=user_id)
    invocations = result.get("tool_invocations", [])

    # Execute all planned tools
    actions_taken = []
    for item in invocations:
        tool_name = item.get("name")
        args = item.get("args", {})
        tool = TOOLBOX.get(tool_name)
        if tool:
            # Inject user_id for note tools
            if tool_name in ("add_note", "get_notes") and "user_id" not in args:
                args["user_id"] = user_id
            try:
                exec_result = tool.fn(**args)
                actions_taken.append({"tool": tool_name, "result": exec_result})
            except Exception as e:
                actions_taken.append({"tool": tool_name, "error": str(e)})

    # Track usage
    if user_id not in _usage_store:
        _usage_store[user_id] = {"features": [], "sessions": []}
    features = _usage_store[user_id].setdefault("features", [])
    modality_name = {
        "voice": "Voice Commands",
        "sign": "Sign Language",
        "gesture": "Gesture Control",
        "morse": "Morse Code",
        "text": "Text Commands",
    }.get(modality, modality)
    feat = next((f for f in features if f["name"] == modality_name), None)
    if feat:
        feat["count"] = feat.get("count", 0) + 1
    else:
        features.append({"name": modality_name, "time_ms": 0, "count": 1, "icon": modality})

    # Build a meaningful response from actions taken
    agent_text = result.get("response_text", "Done.")
    if actions_taken:
        summaries = []
        for a in actions_taken:
            r = a.get("result", {})
            name = a.get("tool", "")
            if r.get("ok"):
                if name == "open_app":
                    summaries.append(f"Opened {r.get('app_name', 'app')}")
                elif name == "search_youtube":
                    summaries.append(f"Searched YouTube for \"{r.get('query', '')}\"")
                elif name == "open_link" or name == "open_tab":
                    summaries.append(f"Opened {r.get('url', 'link')}")
                elif name == "web_search":
                    summaries.append(f"Searched the web for \"{r.get('query', '')}\"")
                elif name == "add_note":
                    note = r.get("note", {})
                    summaries.append(f"Note opened in Notepad: {note.get('title', 'note')}")
                elif name == "get_notes":
                    notes = r.get("notes", [])
                    summaries.append(f"Found {len(notes)} note(s)")
                elif name == "take_screenshot":
                    summaries.append("Screenshot captured")
                elif name == "play_media":
                    summaries.append("Playing media")
                elif name == "pause_media":
                    summaries.append("Media paused")
                elif name == "adjust_volume":
                    summaries.append(f"Volume {r.get('direction', 'adjusted')}")
                elif name == "go_home":
                    summaries.append("Went to home screen")
                elif name == "go_back":
                    summaries.append("Went back")
                elif name == "scroll_page":
                    summaries.append(f"Scrolled {r.get('direction', 'down')}")
                elif name == "set_reminder":
                    summaries.append(f"Reminder set: {r.get('message', '')}")
                else:
                    summaries.append(f"{name} done")
            else:
                summaries.append(f"{name} failed: {r.get('error', a.get('error', 'unknown'))}")
        response_text = ". ".join(summaries) + "."
    else:
        response_text = agent_text

    return {
        "ok": True,
        "response_text": response_text,
        "tool_invocations": invocations,
        "actions_taken": actions_taken,
        "modality": modality,
        "language": language,
    }


# ── Morse Code Decode ──────────────────────────────────────────
MORSE_DECODE_TABLE = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
    '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
    '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
    '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
    '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
    '--..': 'Z', '.----': '1', '..---': '2', '...--': '3', '....-': '4',
    '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9',
    '-----': '0',
}


@app.post("/api/morse/decode")
async def morse_decode(request: Request) -> dict:
    payload = await request.json()
    morse_text = str(payload.get("morse", "")).strip()
    if not morse_text:
        return {"ok": False, "error": "No morse code provided"}

    words = morse_text.split("   ")  # 3 spaces = word boundary
    decoded_words = []
    for word in words:
        chars = word.strip().split(" ")
        decoded_chars = [MORSE_DECODE_TABLE.get(c.strip(), '?') for c in chars if c.strip()]
        decoded_words.append("".join(decoded_chars))

    decoded_text = " ".join(decoded_words)
    return {"ok": True, "decoded": decoded_text, "morse": morse_text}


# ── Notes API ──────────────────────────────────────────────────
@app.post("/api/notes/add")
async def add_note_endpoint(request: Request) -> dict:
    user_id = resolve_user_id(request)
    payload = await request.json()
    title = str(payload.get("title", "")).strip() or "Quick Note"
    content = str(payload.get("content", "")).strip()
    if not content:
        return {"ok": False, "error": "No content provided"}
    result = add_note(title, content, user_id)
    return result


@app.get("/api/notes")
def list_notes(request: Request) -> dict:
    user_id = resolve_user_id(request)
    return get_notes(user_id)


# ── Languages list ─────────────────────────────────────────────
@app.get("/api/languages")
def supported_languages() -> dict:
    """Return all supported voice input languages."""
    return {
        "ok": True,
        "languages": [
            {"code": "af-ZA", "name": "Afrikaans"}, {"code": "am-ET", "name": "Amharic"},
            {"code": "ar-SA", "name": "Arabic (Saudi Arabia)"}, {"code": "ar-EG", "name": "Arabic (Egypt)"},
            {"code": "hy-AM", "name": "Armenian"}, {"code": "az-AZ", "name": "Azerbaijani"},
            {"code": "eu-ES", "name": "Basque"}, {"code": "bn-BD", "name": "Bengali (Bangladesh)"},
            {"code": "bn-IN", "name": "Bengali (India)"}, {"code": "bs-BA", "name": "Bosnian"},
            {"code": "bg-BG", "name": "Bulgarian"}, {"code": "my-MM", "name": "Burmese"},
            {"code": "ca-ES", "name": "Catalan"}, {"code": "zh-CN", "name": "Chinese (Simplified)"},
            {"code": "zh-TW", "name": "Chinese (Traditional)"}, {"code": "hr-HR", "name": "Croatian"},
            {"code": "cs-CZ", "name": "Czech"}, {"code": "da-DK", "name": "Danish"},
            {"code": "nl-NL", "name": "Dutch"}, {"code": "en-US", "name": "English (US)"},
            {"code": "en-GB", "name": "English (UK)"}, {"code": "en-AU", "name": "English (Australia)"},
            {"code": "en-IN", "name": "English (India)"}, {"code": "et-EE", "name": "Estonian"},
            {"code": "fil-PH", "name": "Filipino"}, {"code": "fi-FI", "name": "Finnish"},
            {"code": "fr-FR", "name": "French"}, {"code": "ka-GE", "name": "Georgian"},
            {"code": "de-DE", "name": "German"}, {"code": "el-GR", "name": "Greek"},
            {"code": "gu-IN", "name": "Gujarati"}, {"code": "he-IL", "name": "Hebrew"},
            {"code": "hi-IN", "name": "Hindi"}, {"code": "hu-HU", "name": "Hungarian"},
            {"code": "is-IS", "name": "Icelandic"}, {"code": "id-ID", "name": "Indonesian"},
            {"code": "it-IT", "name": "Italian"}, {"code": "ja-JP", "name": "Japanese"},
            {"code": "kn-IN", "name": "Kannada"}, {"code": "kk-KZ", "name": "Kazakh"},
            {"code": "km-KH", "name": "Khmer"}, {"code": "ko-KR", "name": "Korean"},
            {"code": "lo-LA", "name": "Lao"}, {"code": "lv-LV", "name": "Latvian"},
            {"code": "lt-LT", "name": "Lithuanian"}, {"code": "mk-MK", "name": "Macedonian"},
            {"code": "ms-MY", "name": "Malay"}, {"code": "ml-IN", "name": "Malayalam"},
            {"code": "mr-IN", "name": "Marathi"}, {"code": "mn-MN", "name": "Mongolian"},
            {"code": "ne-NP", "name": "Nepali"}, {"code": "no-NO", "name": "Norwegian"},
            {"code": "fa-IR", "name": "Persian"}, {"code": "pl-PL", "name": "Polish"},
            {"code": "pt-BR", "name": "Portuguese (Brazil)"}, {"code": "pt-PT", "name": "Portuguese (Portugal)"},
            {"code": "pa-IN", "name": "Punjabi"}, {"code": "ro-RO", "name": "Romanian"},
            {"code": "ru-RU", "name": "Russian"}, {"code": "sr-RS", "name": "Serbian"},
            {"code": "si-LK", "name": "Sinhala"}, {"code": "sk-SK", "name": "Slovak"},
            {"code": "sl-SI", "name": "Slovenian"}, {"code": "so-SO", "name": "Somali"},
            {"code": "es-ES", "name": "Spanish (Spain)"}, {"code": "es-MX", "name": "Spanish (Mexico)"},
            {"code": "sw-KE", "name": "Swahili"}, {"code": "sv-SE", "name": "Swedish"},
            {"code": "ta-IN", "name": "Tamil"}, {"code": "te-IN", "name": "Telugu"},
            {"code": "th-TH", "name": "Thai"}, {"code": "tr-TR", "name": "Turkish"},
            {"code": "uk-UA", "name": "Ukrainian"}, {"code": "ur-PK", "name": "Urdu"},
            {"code": "uz-UZ", "name": "Uzbek"}, {"code": "vi-VN", "name": "Vietnamese"},
            {"code": "cy-GB", "name": "Welsh"}, {"code": "yo-NG", "name": "Yoruba"},
            {"code": "zu-ZA", "name": "Zulu"},
        ],
    }


@app.get("/api/devices", response_model=list[DeviceInfo])
def list_devices() -> list[DeviceInfo]:
    rows = get_all_devices()
    return [DeviceInfo(**{k: v for k, v in r.items() if k in ('id', 'name', 'type', 'online')}) for r in rows]


@app.post("/api/devices/pair")
def pair_device(payload: DevicePairRequest, request: Request) -> dict:
    _user_id = resolve_user_id(request)
    device_id = f"paired-{payload.pairing_code.lower()}"
    device_name = f"Device-{payload.pairing_code}"
    upsert_device(device_id, device_name, payload.method, online=True)
    return {
        "ok": True,
        "device_id": device_id,
        "device_name": device_name,
        "method": payload.method,
    }


@app.delete("/api/devices/{device_id}")
def delete_device(device_id: str, request: Request) -> dict:
    _user_id = resolve_user_id(request)
    removed = remove_device(device_id)
    if not removed:
        return {"ok": False, "error": "Device not found"}
    return {"ok": True, "device_id": device_id}


@app.post("/api/devices/{device_id}/heartbeat")
def heartbeat(device_id: str, request: Request) -> dict:
    _user_id = resolve_user_id(request)
    device_heartbeat(device_id)
    return {"ok": True, "device_id": device_id}


@app.post("/api/devices/{device_id}/online")
def set_online(device_id: str, request: Request, online: bool = True) -> dict:
    _user_id = resolve_user_id(request)
    set_device_online(device_id, online)
    return {"ok": True, "device_id": device_id, "online": online}


# ── Device Discovery (Wi-Fi / Bluetooth) ────────────────────────

def _scan_wifi_devices() -> list[dict]:
    """Discover devices on the local network via ARP table."""
    devices: list[dict] = []
    try:
        # Use 'arp -a' which works on Windows, macOS, and Linux
        result = subprocess.run(
            ["arp", "-a"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            # Parse ARP table lines — formats vary by OS
            # Windows: "  192.168.1.5          aa-bb-cc-dd-ee-ff     dynamic"
            # Linux/Mac: "? (192.168.1.5) at aa:bb:cc:dd:ee:ff ..."
            parts = line.split()
            ip = None
            mac = None
            for p in parts:
                # Match IP addresses
                stripped = p.strip("()")
                if not ip and stripped.count(".") == 3:
                    try:
                        socket.inet_aton(stripped)
                        ip = stripped
                    except OSError:
                        pass
                # Match MAC addresses (: or - separated)
                if not mac and (p.count(":") == 5 or p.count("-") == 5) and len(p) >= 11:
                    mac = p.replace("-", ":").lower()
            if ip and mac and mac != "ff:ff:ff:ff:ff:ff":
                # Try to resolve hostname
                hostname = ip
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except (socket.herror, OSError):
                    pass
                # Guess device type from hostname
                name_lower = hostname.lower()
                dtype = "unknown"
                if any(k in name_lower for k in ("phone", "android", "iphone", "pixel", "galaxy", "mobile")):
                    dtype = "mobile"
                elif any(k in name_lower for k in ("laptop", "desktop", "pc", "macbook", "imac")):
                    dtype = "desktop"
                elif any(k in name_lower for k in ("tv", "chromecast", "firestick", "roku")):
                    dtype = "tv"
                elif any(k in name_lower for k in ("printer", "print")):
                    dtype = "printer"
                devices.append({
                    "address": ip,
                    "mac": mac,
                    "name": hostname,
                    "type": dtype,
                    "method": "wifi",
                })
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    return devices


async def _scan_ble_devices() -> list[dict]:
    """Discover BLE devices using the bleak library (if installed)."""
    devices: list[dict] = []
    try:
        from bleak import BleakScanner  # type: ignore[import-untyped]
        discovered = await BleakScanner.discover(timeout=5.0)
        for d in discovered:
            name = d.name or f"BLE-{d.address[-5:].replace(':', '')}"
            dtype = "unknown"
            name_lower = name.lower()
            if any(k in name_lower for k in ("phone", "android", "iphone", "pixel", "galaxy")):
                dtype = "mobile"
            elif any(k in name_lower for k in ("laptop", "pc", "macbook")):
                dtype = "desktop"
            devices.append({
                "address": d.address,
                "name": name,
                "type": dtype,
                "rssi": getattr(d, "rssi", None),
                "method": "bluetooth",
            })
    except ImportError:
        pass  # bleak not installed — return empty
    except Exception:
        pass  # BLE adapter not available
    return devices


@app.post("/api/devices/scan/wifi")
def scan_wifi(request: Request) -> dict:
    """Scan the local network for nearby devices via ARP."""
    _user_id = resolve_user_id(request)
    devices = _scan_wifi_devices()
    return {"ok": True, "method": "wifi", "devices": devices, "count": len(devices)}


@app.post("/api/devices/scan/bluetooth")
async def scan_bluetooth(request: Request) -> dict:
    """Scan for nearby Bluetooth Low Energy devices."""
    _user_id = resolve_user_id(request)
    devices = await _scan_ble_devices()
    return {"ok": True, "method": "bluetooth", "devices": devices, "count": len(devices)}


@app.post("/api/devices/pair-discovered")
def pair_discovered(payload: DevicePairDiscoveredRequest, request: Request) -> dict:
    """Pair a device found via Wi-Fi or Bluetooth scanning."""
    _user_id = resolve_user_id(request)
    addr_slug = payload.address.replace(".", "-").replace(":", "-").lower()
    device_id = f"disc-{payload.method[:2]}-{addr_slug}"
    device_name = payload.name or f"Device-{payload.address}"
    dtype = payload.device_type if payload.device_type != "unknown" else payload.method
    upsert_device(device_id, device_name, dtype, online=True)
    return {
        "ok": True,
        "device_id": device_id,
        "device_name": device_name,
        "method": payload.method,
        "address": payload.address,
    }


# ── File / Link Transfer between devices ────────────────────────
TRANSFER_DIR = Path(os.getenv("TRANSFER_DIR", "./transfers"))
TRANSFER_DIR.mkdir(parents=True, exist_ok=True)

# In-memory transfer queue: list of transfer records
TRANSFER_QUEUE: list[dict] = []

# SSE subscribers: device_id -> list of asyncio.Queue
_transfer_subscribers: dict[str, list[asyncio.Queue]] = {}


def _notify_device(device_id: str, record: dict) -> None:
    """Push a transfer record to all SSE subscribers for a device."""
    for q in _transfer_subscribers.get(device_id, []):
        try:
            q.put_nowait(record)
        except asyncio.QueueFull:
            pass  # drop if subscriber is overwhelmed


# Max upload size: 100 MB
MAX_UPLOAD_BYTES = 100 * 1024 * 1024


@app.post("/api/transfer/upload")
async def transfer_upload(
    request: Request,
    file: UploadFile = File(...),
    source_device: str = Form(...),
    target_device: str = Form(...),
) -> dict:
    _user_id = resolve_user_id(request)
    # Read file with size check
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        return {"ok": False, "error": "File exceeds 100 MB limit"}

    transfer_id = str(uuid.uuid4())
    safe_name = Path(file.filename or "file").name  # strip directory components
    dest = TRANSFER_DIR / transfer_id
    dest.mkdir(parents=True, exist_ok=True)
    file_path = dest / safe_name
    file_path.write_bytes(contents)

    record = {
        "id": transfer_id,
        "type": "file",
        "filename": safe_name,
        "size": len(contents),
        "source_device": source_device,
        "target_device": target_device,
        "status": "pending",
        "created_at": time.time(),
    }
    TRANSFER_QUEUE.append(record)
    _notify_device(target_device, record)
    return {"ok": True, **record}


@app.post("/api/transfer/upload-folder")
async def transfer_upload_folder(
    request: Request,
    files: list[UploadFile] = File(...),
    paths: str = Form(...),
    folder_name: str = Form(...),
    source_device: str = Form(...),
    target_device: str = Form(...),
) -> dict:
    """Accept multiple files with relative paths, zip them, and store as a folder transfer."""
    _user_id = resolve_user_id(request)
    relative_paths = json.loads(paths)  # list of relative paths matching files order
    if len(relative_paths) != len(files):
        return {"ok": False, "error": "Mismatch between files and paths counts"}

    transfer_id = str(uuid.uuid4())
    dest = TRANSFER_DIR / transfer_id
    dest.mkdir(parents=True, exist_ok=True)

    # Sanitize folder name
    safe_folder = "".join(c for c in folder_name if c.isalnum() or c in " ._-()").strip() or "folder"
    zip_name = f"{safe_folder}.zip"
    zip_path = dest / zip_name

    total_size = 0
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for up_file, rel_path in zip(files, relative_paths):
            contents = await up_file.read()
            total_size += len(contents)
            if total_size > MAX_UPLOAD_BYTES:
                return {"ok": False, "error": "Folder exceeds 100 MB limit"}
            # Sanitise: keep relative path but prevent path traversal
            safe_rel = Path(rel_path).as_posix().lstrip("/")
            if ".." in safe_rel.split("/"):
                continue  # skip any traversal attempts
            zf.writestr(safe_rel, contents)

    zip_path.write_bytes(buf.getvalue())

    record = {
        "id": transfer_id,
        "type": "folder",
        "filename": zip_name,
        "folder_name": safe_folder,
        "file_count": len(files),
        "size": total_size,
        "source_device": source_device,
        "target_device": target_device,
        "status": "pending",
        "created_at": time.time(),
    }
    TRANSFER_QUEUE.append(record)
    _notify_device(target_device, record)
    return {"ok": True, **record}


@app.post("/api/transfer/link")
def transfer_link(payload: TransferLinkRequest, request: Request) -> dict:
    _user_id = resolve_user_id(request)
    transfer_id = str(uuid.uuid4())
    record = {
        "id": transfer_id,
        "type": "link",
        "url": payload.url,
        "title": payload.title or payload.url,
        "source_device": payload.source_device,
        "target_device": payload.target_device,
        "status": "pending",
        "created_at": time.time(),
    }
    TRANSFER_QUEUE.append(record)
    _notify_device(payload.target_device, record)
    return {"ok": True, **record}


@app.get("/api/transfer/notifications/{device_id}")
async def transfer_notifications(device_id: str, request: Request):
    """SSE stream: pushes real-time events when a transfer targets this device."""
    _user_id = resolve_user_id(request)
    q: asyncio.Queue = asyncio.Queue(maxsize=64)
    _transfer_subscribers.setdefault(device_id, []).append(q)

    async def event_stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    record = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(record)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # prevent connection timeout
        finally:
            _transfer_subscribers.get(device_id, []).remove(q) if q in _transfer_subscribers.get(device_id, []) else None

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/transfer/pending/{device_id}")
def transfer_pending(device_id: str, request: Request) -> dict:
    _user_id = resolve_user_id(request)
    pending = [t for t in TRANSFER_QUEUE if t["target_device"] == device_id and t["status"] == "pending"]
    return {"ok": True, "transfers": pending}


@app.get("/api/transfer/download/{transfer_id}")
def transfer_download(transfer_id: str, request: Request):
    _user_id = resolve_user_id(request)
    record = next((t for t in TRANSFER_QUEUE if t["id"] == transfer_id), None)
    if not record:
        return {"ok": False, "error": "Transfer not found"}
    if record["type"] == "link":
        return {"ok": True, "type": "link", "url": record["url"], "title": record.get("title", "")}
    # File or folder transfer — return the file (folder is returned as zip)
    dest = TRANSFER_DIR / transfer_id / record["filename"]
    if not dest.exists():
        return {"ok": False, "error": "File no longer available"}
    record["status"] = "downloaded"
    # Notify sender that file was downloaded
    _notify_device(record["source_device"], {
        **record,
        "_event": "receipt",
        "_receipt_action": "downloaded",
        "_receipt_by": record["target_device"],
    })
    media = "application/zip" if record["type"] == "folder" else None
    return FileResponse(path=str(dest), filename=record["filename"], media_type=media)


@app.post("/api/transfer/accept/{transfer_id}")
def transfer_accept(transfer_id: str, request: Request) -> dict:
    _user_id = resolve_user_id(request)
    record = next((t for t in TRANSFER_QUEUE if t["id"] == transfer_id), None)
    if not record:
        return {"ok": False, "error": "Transfer not found"}
    record["status"] = "accepted"
    # Notify sender that target accepted
    _notify_device(record["source_device"], {
        **record,
        "_event": "receipt",
        "_receipt_action": "accepted",
        "_receipt_by": record["target_device"],
    })
    return {"ok": True, "transfer": record}


@app.post("/api/transfer/decline/{transfer_id}")
def transfer_decline(transfer_id: str, request: Request) -> dict:
    _user_id = resolve_user_id(request)
    record = next((t for t in TRANSFER_QUEUE if t["id"] == transfer_id), None)
    if not record:
        return {"ok": False, "error": "Transfer not found"}
    record["status"] = "declined"
    # Notify sender that target declined
    _notify_device(record["source_device"], {
        **record,
        "_event": "receipt",
        "_receipt_action": "declined",
        "_receipt_by": record["target_device"],
    })
    return {"ok": True, "transfer": record}


@app.get("/api/transfer/incoming/{device_id}")
def transfer_incoming(device_id: str, request: Request) -> dict:
    """Return all non-declined transfers targeting this device, newest first."""
    _user_id = resolve_user_id(request)
    incoming = [
        t for t in TRANSFER_QUEUE
        if t["target_device"] == device_id and t["status"] != "declined"
    ]
    return {"ok": True, "transfers": list(reversed(incoming[-50:]))}


@app.get("/api/transfer/history")
def transfer_history(request: Request) -> dict:
    _user_id = resolve_user_id(request)
    # Return last 50 transfers, newest first
    return {"ok": True, "transfers": list(reversed(TRANSFER_QUEUE[-50:]))}


@app.get("/api/mobile/health")
def mobile_health(request: Request, serial: str | None = None) -> dict:
    _user_id = resolve_user_id(request)
    return mobile_reliability_check(serial)


@app.post("/api/command", response_model=CommandResponse)
def command(req: CommandRequest, request: Request) -> CommandResponse:
    user_id = resolve_user_id(request)
    result = agent.run(req.text, req.device_id, user_id=user_id)
    invocations = result.get("tool_invocations", [])
    
    # LangChain/Nova orchestration replaces native ADK runtime
    execution_results = []
    for item in invocations:
        tool_name = item.get("name")
        args = item.get("args", {})
        tool = TOOLBOX.get(tool_name)
        if tool:
            execution_results.append(tool.fn(**args))
            
    return CommandResponse(
        response_text=result.get("response_text", "Done."),
        tool_invocations=invocations,
        execution_results=execution_results,
    )


@app.post("/api/gesture/event")
def gesture_event(req: GestureEventRequest, request: Request) -> dict:
    user_id = resolve_user_id(request)
    action = map_gesture_to_action(req.gesture_name)
    context_id = req.metadata.get("context_id", str(uuid.uuid4()))
    automation_result = None

    custom_task = None
    if action == "unknown":
        # Allow user-trained sign/gesture names to trigger mapped tasks.
        for item in list_gestures(user_id):
            if str(item.get("name", "")).strip().lower() == req.gesture_name.strip().lower():
                custom_task = str(item.get("mapped_task") or "").strip()
                break
        if custom_task:
            action = "custom_task"

    if action == "capture_context":
        save_context_transfer(user_id, context_id, req.source_device, None, json.dumps(req.metadata))
    if action == "release_context" and req.target_device:
        save_context_transfer(user_id, context_id, req.source_device, req.target_device, json.dumps(req.metadata))
        captured_payload = get_latest_context_payload(user_id, context_id) or {}
        merged_payload = {**captured_payload, **req.metadata}
        automation_result = continue_context_on_device(req.target_device, merged_payload)

    if action in {"scroll", "click", "navigate"}:
        # Pass the gesture context to the agent for "interpretation"
        prompt = f"The user performed a '{req.gesture_name}' gesture (action: {action}). Execute the appropriate UI automation."
        result = agent.run(prompt, req.source_device, user_id=user_id)
        invocations = result.get("tool_invocations", [])
        
        execution_results = []
        for item in invocations:
            t_name = item.get("name")
            t_args = item.get("args", {})
            t_tool = TOOLBOX.get(t_name)
            if t_tool:
                execution_results.append(t_tool.fn(**t_args))
        automation_result = {"agent_response": result.get("response_text"), "details": execution_results}

    if action in {"confirm", "cancel"}:
        automation_result = execute_for_device(req.source_device, action, req.metadata)

    if action == "custom_task" and custom_task:
        result = agent.run(custom_task, req.source_device, user_id=user_id)
        invocations = result.get("tool_invocations", [])
        execution_results = []
        for item in invocations:
            t_name = item.get("name")
            t_args = item.get("args", {})
            t_tool = TOOLBOX.get(t_name)
            if t_tool:
                execution_results.append(t_tool.fn(**t_args))
        automation_result = {
            "custom_task": custom_task,
            "agent_response": result.get("response_text"),
            "details": execution_results,
        }

    return {"ok": True, "action": action, "context_id": context_id, "automation": automation_result}


@app.post("/api/gesture/train")
def train_gesture(req: TrainGestureRequest, request: Request) -> dict:
    user_id = resolve_user_id(request)
    save_gesture(user_id, req.name, json.dumps(req.landmarks), req.mapped_task)
    return {"ok": True, "gesture": req.name}


@app.get("/api/gesture/custom")
def custom_gestures(request: Request) -> list[dict]:
    user_id = resolve_user_id(request)
    return list_gestures(user_id)


@app.delete("/api/gesture/custom/{name}")
def delete_custom_gesture(name: str, request: Request) -> dict:
    user_id = resolve_user_id(request)
    deleted = delete_gesture(user_id, name)
    return {"ok": deleted}


@app.get("/api/sign/vocabulary")
def sign_vocabulary() -> dict:
    """Return the full ASL sign vocabulary with action mappings."""
    vocab = get_vocabulary()
    return {
        "ok": True,
        "count": len(vocab),
        "signs": {
            label: {"action": info["action"], "description": info["description"]}
            for label, info in vocab.items()
        },
    }


@app.get("/api/sign/stats")
def sign_stats(request: Request) -> dict:
    """Return the user's sign training statistics."""
    user_id = resolve_user_id(request)
    return {"ok": True, **get_user_sign_stats(user_id)}


@app.post("/api/sign/train")
def train_sign_language(req: SignTrainRequest, request: Request) -> dict:
    user_id = resolve_user_id(request)
    return train_sign(user_id, req.label, req.landmarks)


@app.post("/api/sign/train/bulk")
async def train_sign_bulk(request: Request) -> dict:
    """Train multiple sign samples at once.
    Body: {"samples": [{"label": "hello", "landmarks": [[x,y,z]...]}, ...]}
    """
    user_id = resolve_user_id(request)
    payload = await request.json()
    samples = payload.get("samples", [])
    if not samples:
        return {"ok": False, "error": "No samples provided"}
    return bulk_train(user_id, samples)


@app.post("/api/sign/predict")
def predict_sign_language(req: SignPredictRequest, request: Request) -> dict:
    user_id = resolve_user_id(request)
    return predict_sign(user_id, req.landmarks)


@app.post("/api/sign/event")
def sign_event(req: SignEventRequest, request: Request) -> dict:
    user_id = resolve_user_id(request)
    prediction = predict_sign(user_id, req.landmarks)
    if not prediction.get("ok"):
        return {"ok": False, "error": prediction.get("error", "Sign prediction failed")}

    label = str(prediction.get("predicted_label") or "").strip()
    if not label:
        return {"ok": False, "error": "No predicted sign label"}

    # 1. Check vocabulary for a direct agent action
    vocab_action = get_sign_action(label)

    # 2. Check user-trained gesture library for a custom mapped task
    mapped_task = None
    for item in list_gestures(user_id):
        if str(item.get("name", "")).strip().lower() == label.lower():
            mapped_task = str(item.get("mapped_task") or "").strip()
            break

    # 3. If vocabulary has a direct action, convert to a natural-language command
    if not mapped_task and vocab_action:
        action_to_command = {
            "confirm": "confirm the current action",
            "cancel": "cancel / go back",
            "greet": "say hello to the user",
            "acknowledge": "acknowledge the user's request",
            "request": "what can I help you with?",
            "stop": "stop current operation",
            "navigate": "navigate forward",
            "scroll_up": "scroll up",
            "scroll_down": "scroll down",
            "open_app": "open the last used application",
            "search": "open search",
            "play_media": "play media",
            "pause_media": "pause media",
            "next_item": "go to next item",
            "go_back": "go back",
            "volume_up": "increase volume",
            "volume_down": "decrease volume",
            "thumbs_up": "that's great, positive feedback",
            "thumbs_down": "negative feedback noted",
            "start_call": "start a call",
            "send_message": "open messaging app",
            "take_photo": "take a photo",
            "go_home": "go to home screen",
        }
        mapped_task = action_to_command.get(vocab_action, vocab_action)

    if not mapped_task:
        return {
            "ok": True,
            "predicted_label": label,
            "confidence": prediction.get("confidence", 0),
            "action": "none",
            "message": "Sign detected but no mapped task found. Train a gesture with this same label to bind an action.",
        }

    result = agent.run(mapped_task, req.source_device, user_id=user_id)
    invocations = result.get("tool_invocations", [])
    execution_results = []
    for item in invocations:
        t_name = item.get("name")
        t_args = item.get("args", {})
        t_tool = TOOLBOX.get(t_name)
        if t_tool:
            execution_results.append(t_tool.fn(**t_args))

    return {
        "ok": True,
        "predicted_label": label,
        "confidence": prediction.get("confidence", 0),
        "action": vocab_action or "custom_task",
        "mapped_task": mapped_task,
        "agent_response": result.get("response_text"),
        "details": execution_results,
    }


@app.get("/api/memory/personal")
def personal_memory(request: Request) -> list[dict]:
    user_id = resolve_user_id(request)
    return get_personal_memory(user_id)


@app.post("/api/settings/avatar")
def save_avatar_settings(payload: AvatarSettings, request: Request) -> dict:
    user_id = resolve_user_id(request)
    set_personal_preference(user_id, "avatar_id", payload.avatar_id)
    set_personal_preference(user_id, "voice_name", payload.voice_name)
    set_personal_preference(user_id, "avatar_theme", payload.theme)
    set_personal_preference(user_id, "avatar_expression", payload.expression)
    set_personal_preference(user_id, "avatar_name", payload.avatar_name)
    set_personal_preference(user_id, "speech_speed", str(payload.speech_speed))
    set_personal_preference(user_id, "animations_enabled", str(payload.animations_enabled))
    return {"ok": True}


# ── AWS Credentials Management ──────────────────────────────────────

def _aws_credentials_status() -> dict:
    """Check current AWS credential status without exposing secrets."""
    access_key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
    secret_key = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
    region = os.getenv("AWS_REGION", "us-east-1")
    has_session = bool((os.getenv("AWS_SESSION_TOKEN") or "").strip())

    # Determine status
    if not access_key or not secret_key:
        status = "not_configured"
    elif access_key.lower().startswith("your_") or secret_key.lower().startswith("your_"):
        status = "placeholder"
    else:
        status = "configured"

    # Mask the key for display (show last 4 chars only)
    masked_key = ""
    if access_key and status == "configured":
        masked_key = "****" + access_key[-4:] if len(access_key) > 4 else "****"

    return {
        "status": status,
        "region": region,
        "masked_access_key": masked_key,
        "has_session_token": has_session,
        "engines": {
            "nova_agent": agent._llm is not None,
            "s3_storage": storage_client.s3_client is not None,
            "nova_sonic": nova_sonic_engine._client is not None,
            "nova_act": nova_act_engine._llm is not None,
        },
    }


def _update_env_file(updates: dict) -> None:
    """Update the .env file with new key-value pairs."""
    env_path = Path(__file__).resolve().parent / ".env"
    lines = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated_keys = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                updated_keys.add(key)
                continue
        new_lines.append(line)

    # Append any keys not already present
    for key, value in updates.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _reinit_all_engines() -> dict:
    """Re-initialize all AWS-backed engine clients with current env vars."""
    results = {}

    # Nova Agent (LangChain)
    agent._llm = None
    agent._llm_init_attempted = False
    agent.region = os.getenv("AWS_REGION", "us-east-1")
    try:
        agent._get_llm()
        results["nova_agent"] = agent._llm is not None
    except Exception:
        results["nova_agent"] = False

    # S3 Storage
    storage_client.s3_client = None
    storage_client._init_attempted = False
    storage_client.region = os.getenv("AWS_REGION", "us-east-1")
    try:
        storage_client._get_client()
        results["s3_storage"] = storage_client.s3_client is not None
    except Exception:
        results["s3_storage"] = False

    # Nova Sonic (direct boto3)
    nova_sonic_engine._client = None
    nova_sonic_engine.region = os.getenv("AWS_REGION", "us-east-1")
    results["nova_sonic"] = True  # Lazy init, will connect on first use

    # Nova Act (LangChain)
    nova_act_engine._llm = None
    nova_act_engine.region = os.getenv("AWS_REGION", "us-east-1")
    results["nova_act"] = True  # Lazy init, will connect on first use

    return results


@app.get("/api/settings/aws/status")
def get_aws_status() -> dict:
    return _aws_credentials_status()


@app.post("/api/settings/aws")
def save_aws_credentials(payload: AWSCredentialsPayload) -> dict:
    """Save AWS credentials to .env and reinitialize all engine clients."""
    access_key = payload.aws_access_key_id.strip()
    secret_key = payload.aws_secret_access_key.strip()
    region = payload.aws_region.strip() or "us-east-1"
    session_token = payload.aws_session_token.strip()

    # Update environment variables in-process
    os.environ["AWS_ACCESS_KEY_ID"] = access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = secret_key
    os.environ["AWS_REGION"] = region
    if session_token:
        os.environ["AWS_SESSION_TOKEN"] = session_token
    elif "AWS_SESSION_TOKEN" in os.environ:
        del os.environ["AWS_SESSION_TOKEN"]

    # Persist to .env file
    env_updates = {
        "AWS_ACCESS_KEY_ID": access_key,
        "AWS_SECRET_ACCESS_KEY": secret_key,
        "AWS_REGION": region,
    }
    if session_token:
        env_updates["AWS_SESSION_TOKEN"] = session_token
    _update_env_file(env_updates)

    # Re-initialize engines with new credentials
    engine_results = _reinit_all_engines()

    return {
        "ok": True,
        **_aws_credentials_status(),
        "engine_reinit": engine_results,
    }


@app.post("/api/settings/aws/test")
def test_aws_credentials(payload: AWSCredentialsPayload) -> dict:
    """Test AWS credentials without saving them."""
    access_key = payload.aws_access_key_id.strip()
    secret_key = payload.aws_secret_access_key.strip()
    region = payload.aws_region.strip() or "us-east-1"
    session_token = payload.aws_session_token.strip() or None

    if not access_key or not secret_key:
        return {"ok": False, "error": "Access Key and Secret Key are required."}

    try:
        import boto3 as _boto3
        from botocore.config import Config as _BotoConfig

        cfg = _BotoConfig(connect_timeout=5, read_timeout=5, retries={"max_attempts": 1})
        client = _boto3.client(
            "bedrock",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            aws_session_token=session_token,
            config=cfg,
        )
        # Light-weight call to validate credentials
        resp = client.list_foundation_models(byOutputModality="TEXT")
        model_count = len(resp.get("modelSummaries", []))
        return {
            "ok": True,
            "message": f"Credentials valid. Found {model_count} text models in {region}.",
            "region": region,
        }
    except Exception as e:
        error_msg = str(e)
        if "InvalidSignatureException" in error_msg or "SignatureDoesNotMatch" in error_msg:
            return {"ok": False, "error": "Invalid credentials — signature mismatch."}
        if "UnrecognizedClientException" in error_msg or "InvalidClientTokenId" in error_msg:
            return {"ok": False, "error": "Invalid Access Key ID."}
        if "ExpiredToken" in error_msg:
            return {"ok": False, "error": "Session token has expired."}
        if "AccessDeniedException" in error_msg:
            return {"ok": False, "error": "Credentials valid but no Bedrock access. Check IAM permissions."}
        return {"ok": False, "error": f"Connection failed: {error_msg}"}


@app.post("/api/settings/aws/clear")
def clear_aws_credentials() -> dict:
    """Clear AWS credentials and revert to heuristic fallback mode."""
    os.environ["AWS_ACCESS_KEY_ID"] = ""
    os.environ["AWS_SECRET_ACCESS_KEY"] = ""
    if "AWS_SESSION_TOKEN" in os.environ:
        del os.environ["AWS_SESSION_TOKEN"]

    _update_env_file({
        "AWS_ACCESS_KEY_ID": "",
        "AWS_SECRET_ACCESS_KEY": "",
    })

    engine_results = _reinit_all_engines()

    return {
        "ok": True,
        **_aws_credentials_status(),
        "engine_reinit": engine_results,
    }


@app.post("/api/live/stream")
def live_stream(req: LiveStreamRequest, request: Request):
    _user_id = resolve_user_id(request)

    def event_stream():
        for chunk in agent.stream_multimodal(req.prompt, req.image_base64):
            yield f"data: {json.dumps({'text': chunk})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/generate/image", response_model=GenerationImageResponse)
def generate_image(req: GenerationRequest, request: Request) -> GenerationImageResponse:
    _user_id = resolve_user_id(request)
    result = agent.generate_image(req.prompt)
    return GenerationImageResponse(**result)


@app.post("/api/generate/video", response_model=GenerationVideoResponse)
def generate_video(req: GenerationRequest, request: Request) -> GenerationVideoResponse:
    _user_id = resolve_user_id(request)
    result = agent.generate_video(req.prompt)
    return GenerationVideoResponse(**result)


@app.websocket("/ws/live")
async def websocket_live_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            prompt = payload.get("prompt", "")
            image_base64 = payload.get("image_base64")

            for chunk in agent.stream_multimodal(prompt, image_base64):
                await websocket.send_json({"type": "chunk", "text": chunk})

            await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"type": "error", "error": str(exc)})
        await websocket.close(code=1011)


# ── Bidirectional Voice Streaming (Nova Sonic) ───────────────
import base64 as _b64


@app.websocket("/ws/voice/sonic")
async def websocket_voice_sonic(websocket: WebSocket):
    """Bidirectional speech-to-speech streaming via WebSocket.

    Client protocol:
      → {"type": "config", "voice_id": str, "language": str}
      → {"type": "audio", "data": "<base64 PCM16 16kHz mono>"}
      → {"type": "end"}                (signals end of user speech)
      → {"type": "text", "text": str}  (text-only input, skip STT)

    Server protocol:
      ← {"type": "transcript_partial", "text": str}
      ← {"type": "transcript_final", "text": str}
      ← {"type": "response_text", "text": str}
      ← {"type": "audio", "data": "<base64 PCM16 16kHz mono>"}
      ← {"type": "done"}
      ← {"type": "error", "error": str}
    """
    await websocket.accept()
    voice_id = "tiffany"
    language = "en-US"

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            if msg_type == "config":
                voice_id = msg.get("voice_id", voice_id)
                language = msg.get("language", language)
                await websocket.send_json({"type": "config_ack", "voice_id": voice_id, "language": language})
                continue

            if msg_type == "text":
                # Text input — skip STT, go straight to response
                user_text = str(msg.get("text", "")).strip()
                if not user_text:
                    continue
                await _handle_voice_text_input(websocket, user_text, voice_id)
                continue

            if msg_type == "audio":
                # Start collecting audio chunks until "end"
                audio_chunks: list[bytes] = []
                data = msg.get("data", "")
                if data:
                    audio_chunks.append(_b64.b64decode(data))

                # Collect subsequent audio frames
                while True:
                    raw2 = await websocket.receive_text()
                    msg2 = json.loads(raw2)
                    t2 = msg2.get("type", "")
                    if t2 == "audio":
                        d2 = msg2.get("data", "")
                        if d2:
                            audio_chunks.append(_b64.b64decode(d2))
                    elif t2 == "end":
                        break
                    else:
                        break

                if not audio_chunks:
                    await websocket.send_json({"type": "error", "error": "No audio data received"})
                    continue

                # Process via Nova Sonic streaming
                async def _audio_gen():
                    for chunk in audio_chunks:
                        yield chunk

                try:
                    async for event in nova_sonic_engine.stream_conversation(
                        _audio_gen(), voice_id=voice_id
                    ):
                        await websocket.send_json(event)
                except Exception as stream_exc:
                    # Fallback: treat audio as if we couldn't process it
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Sonic stream failed: {stream_exc}. Using heuristic fallback."
                    })
                    # Even on failure, send a done so client knows round-trip is finished
                    await websocket.send_json({"type": "done"})
                continue

            # Unknown message type — ignore
            continue

    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "error": str(exc)})
            await websocket.close(code=1011)
        except Exception:
            pass


async def _handle_voice_text_input(websocket: WebSocket, text: str, voice_id: str):
    """Handle text-mode voice interaction: generate response + optional TTS."""
    # Try LLM-based response first, then heuristic fallback
    result = nova_sonic_engine.heuristic_respond(text)
    response_text = result.get("text", "")

    await websocket.send_json({"type": "transcript_final", "text": text})
    await websocket.send_json({"type": "response_text", "text": response_text})

    # Execute any associated action
    action = result.get("action")
    if action and action in TOOLBOX:
        tool = TOOLBOX[action]
        args = result.get("args", {})
        try:
            exec_result = tool.fn(**args)
            await websocket.send_json({"type": "action", "action": action, "result": str(exec_result)[:500]})
        except Exception:
            pass

    # Try to generate TTS audio for the response
    try:
        async for audio_event in nova_sonic_engine._synthesize_stream(response_text):
            await websocket.send_json(audio_event)
    except Exception:
        pass  # TTS unavailable — text response already sent

    await websocket.send_json({"type": "done"})


@app.post("/api/act/analyze")
async def act_analyze(request: Request) -> dict:
    user_id = resolve_user_id(request)
    payload = await request.json()
    screenshot_base64 = str(payload.get("screenshot_base64") or "").strip()
    goal = str(payload.get("goal") or "").strip()
    device_id = payload.get("device_id")
    autonomous = payload.get("autonomous", False)
    max_steps = int(payload.get("max_steps", 5))

    if not goal:
        return {"ok": False, "error": "goal is required"}

    if autonomous:
        # Full autonomous loop — captures screenshots automatically
        result = nova_act_engine.autonomous_run(goal, device_id, max_steps=min(max_steps, 10))
        return {"ok": True, "user_id": user_id, "mode": "autonomous", "result": result}

    if not screenshot_base64:
        # If no screenshot provided, capture one live
        try:
            screenshot_base64 = nova_act_engine._capture_screenshot(device_id)
        except RuntimeError as exc:
            return {"ok": False, "error": str(exc)}

    result = nova_act_engine.analyze_ui_and_execute(screenshot_base64, goal, device_id)
    return {"ok": True, "user_id": user_id, "mode": "single_step", "result": result}


@app.post("/api/voice/synthesize")
async def voice_synthesize(request: Request) -> dict:
    user_id = resolve_user_id(request)
    payload = await request.json()
    text = str(payload.get("text") or "").strip()

    if not text:
        return {"ok": False, "error": "text is required"}

    output_dir = Path(os.getenv("UPLOADS_DIR", "./uploads"))
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"voice-{uuid.uuid4()}.bin"

    success = nova_sonic_engine.synthesize_speech(text, str(output_path))
    return {
        "ok": success,
        "user_id": user_id,
        "output_path": output_path.as_posix() if success else None,
    }
