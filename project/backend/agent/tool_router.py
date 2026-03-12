from __future__ import annotations

import re
from typing import Any, Dict, List


_KNOWN_APPS = [
    "youtube", "chrome", "whatsapp", "telegram", "slack", "spotify",
    "zoom", "teams", "gmail", "maps", "camera", "calculator",
    "calendar", "notes", "settings", "clock", "safari", "firefox",
    "edge", "opera", "brave", "discord", "instagram", "twitter",
    "facebook", "tiktok", "snapchat", "pinterest", "reddit",
    "linkedin", "netflix", "amazon", "uber", "lyft", "doordash",
    "grubhub", "weather", "files", "photos", "music", "podcasts",
    "news", "health", "fitness", "wallet", "banking",
]

_URL_PATTERN = re.compile(
    r'(?:https?://)?(?:www\.)?[\w.-]+\.(?:com|org|net|io|dev|ai|co|edu|gov|app|me|info|biz)(?:/[\w./?%&=+-]*)?',
    re.IGNORECASE,
)


def _infer_app_name(raw: str) -> str:
    for app in _KNOWN_APPS:
        if app in raw:
            return app
    return ""


def _extract_url(text: str) -> str | None:
    match = _URL_PATTERN.search(text)
    if match:
        url = match.group(0)
        if not url.startswith("http"):
            url = "https://" + url
        return url
    return None


def heuristic_tool_plan(command: str, device_id: str | None) -> List[Dict[str, Any]]:
    text = command.lower()
    plan: List[Dict[str, Any]] = []

    # ── Note / memo / reminder ─────────────────────────────────
    if any(kw in text for kw in ("add note", "take note", "save note", "write note", "make note", "add a note", "new note", "create note")):
        # Try to extract note content after the keyword
        for prefix in ("add note ", "take note ", "save note ", "write note ", "make note ", "create note ", "new note "):
            if prefix in text:
                content = command[text.index(prefix) + len(prefix):].strip()
                if content:
                    plan.append({"name": "add_note", "args": {"title": content[:50], "content": content}})
                    return plan
        plan.append({"name": "add_note", "args": {"title": "Quick Note", "content": command}})
        return plan

    if any(kw in text for kw in ("show notes", "get notes", "list notes", "my notes")):
        plan.append({"name": "get_notes", "args": {}})
        return plan

    if any(kw in text for kw in ("remind me", "set reminder", "set alarm")):
        plan.append({"name": "set_reminder", "args": {"message": command, "delay_seconds": 60}})
        return plan

    # ── URL-based actions ──────────────────────────────────────
    url = _extract_url(command)
    if url:
        if "new tab" in text or "open tab" in text:
            plan.append({"name": "open_tab", "args": {"url": url, "device_id": device_id}})
        else:
            plan.append({"name": "open_link", "args": {"url": url, "device_id": device_id}})
        return plan

    if "open tab" in text or "new tab" in text:
        plan.append({"name": "open_tab", "args": {"url": "about:newtab", "device_id": device_id}})
        return plan

    # ── App launching ──────────────────────────────────────────
    if "open" in text and "youtube" in text:
        plan.append({"name": "open_app", "args": {"app_name": "youtube", "device_id": device_id}})

    if "search" in text and "youtube" in text:
        query = command.split("search", 1)[-1].strip() or "trending"
        plan.append({"name": "search_youtube", "args": {"query": query, "device_id": device_id}})

    if "send message" in text:
        plan.append({"name": "send_message", "args": {"contact": "favorite-contact", "message": command, "device_id": device_id}})

    if any(kw in text for kw in ("switch", "change app", "move to")):
        plan.append({"name": "open_app", "args": {"app_name": _infer_app_name(text), "device_id": device_id}})

    if "open" in text and not any(item["name"] == "open_app" for item in plan):
        app = _infer_app_name(text)
        if app:
            plan.append({"name": "open_app", "args": {"app_name": app, "device_id": device_id}})

    # ── Web search ─────────────────────────────────────────────
    if any(kw in text for kw in ("search for", "search the web", "google", "look up", "find me")):
        for prefix in ("search for ", "search the web for ", "google ", "look up ", "find me "):
            if prefix in text:
                query = command[text.index(prefix) + len(prefix):].strip()
                if query:
                    plan.append({"name": "web_search", "args": {"query": query, "device_id": device_id}})
                    return plan

    if "search" in text and "youtube" not in text and not plan:
        query = command.split("search", 1)[-1].strip() or command
        plan.append({"name": "web_search", "args": {"query": query, "device_id": device_id}})

    # ── Media controls ─────────────────────────────────────────
    if any(kw in text for kw in ("play music", "play media", "play video", "resume")):
        plan.append({"name": "play_media", "args": {"device_id": device_id}})
    if any(kw in text for kw in ("pause", "stop music", "stop media", "stop video")):
        plan.append({"name": "pause_media", "args": {"device_id": device_id}})
    if "volume up" in text or "turn up" in text or "louder" in text:
        plan.append({"name": "adjust_volume", "args": {"direction": "up", "device_id": device_id}})
    if "volume down" in text or "turn down" in text or "quieter" in text:
        plan.append({"name": "adjust_volume", "args": {"direction": "down", "device_id": device_id}})

    # ── Navigation ─────────────────────────────────────────────
    if "scroll down" in text:
        plan.append({"name": "scroll_page", "args": {"direction": "down", "device_id": device_id}})
    if "scroll up" in text:
        plan.append({"name": "scroll_page", "args": {"direction": "up", "device_id": device_id}})
    if "go home" in text or "home screen" in text:
        plan.append({"name": "go_home", "args": {"device_id": device_id}})
    if "go back" in text or "back" == text.strip():
        plan.append({"name": "go_back", "args": {"device_id": device_id}})

    # ── Screenshot ─────────────────────────────────────────────
    if any(kw in text for kw in ("screenshot", "screen capture", "take screenshot", "capture screen")):
        plan.append({"name": "take_screenshot", "args": {"device_id": device_id}})

    return plan
