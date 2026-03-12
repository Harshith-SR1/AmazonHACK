from __future__ import annotations

import datetime
import json
import os
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List

from tools.context_continuation import continue_context_on_device
from tools.automation_controller import execute_for_device


@dataclass
class ToolSpec:
    name: str
    description: str
    fn: Callable[..., Dict[str, Any]]


# ── In-memory notes store ──────────────────────────────────────
_notes_store: Dict[str, List[Dict[str, Any]]] = {}


def open_app(app_name: str, device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "open_app", {"app_name": app_name})
    return {"tool": "open_app", "app_name": app_name, "device_id": device_id, **result}


def search_youtube(query: str, device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "search_youtube", {"query": query})
    return {"tool": "search_youtube", "query": query, "device_id": device_id, **result}


def send_message(contact: str, message: str, device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "send_message", {"contact": contact, "message": message})
    return {"tool": "send_message", "contact": contact, "message": message, "device_id": device_id, **result}


def transfer_device_context(
    context_id: str, from_device: str, to_device: str, payload: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    transfer_result = continue_context_on_device(to_device, payload or {})
    return {"tool": "transfer_device_context", "context_id": context_id, "from_device": from_device, "to_device": to_device, **transfer_result}


import subprocess
import tempfile

def add_note(title: str, content: str, user_id: str = "anonymous") -> Dict[str, Any]:
    note = {
        "id": f"note-{len(_notes_store.get(user_id, [])) + 1}",
        "title": title,
        "content": content,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    _notes_store.setdefault(user_id, []).append(note)
    # Open Notepad with the note content
    try:
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', prefix='note_', delete=False, encoding='utf-8')
        tmp.write(f"{title}\n{'=' * len(title)}\n\n{content}")
        tmp.close()
        subprocess.Popen(['notepad.exe', tmp.name])
    except Exception:
        pass  # best-effort, don't fail the note save
    return {"tool": "add_note", "ok": True, "note": note}


def get_notes(user_id: str = "anonymous") -> Dict[str, Any]:
    return {"tool": "get_notes", "ok": True, "notes": _notes_store.get(user_id, [])}


def open_link(url: str, device_id: str | None = None) -> Dict[str, Any]:
    if device_id and device_id.startswith("phone"):
        result = execute_for_device(device_id, "open_link", {"url": url})
        return {"tool": "open_link", "url": url, "device_id": device_id, **result}
    try:
        webbrowser.open(url)
        return {"tool": "open_link", "url": url, "ok": True, "message": f"Opened {url}"}
    except Exception as e:
        return {"tool": "open_link", "url": url, "ok": False, "error": str(e)}


def open_tab(url: str, device_id: str | None = None) -> Dict[str, Any]:
    if device_id and device_id.startswith("phone"):
        result = execute_for_device(device_id, "open_tab", {"url": url})
        return {"tool": "open_tab", "url": url, "device_id": device_id, **result}
    try:
        webbrowser.open_new_tab(url)
        return {"tool": "open_tab", "url": url, "ok": True, "message": f"Opened new tab: {url}"}
    except Exception as e:
        return {"tool": "open_tab", "url": url, "ok": False, "error": str(e)}


def web_search(query: str, device_id: str | None = None) -> Dict[str, Any]:
    import urllib.parse
    search_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(query)}"
    return open_tab(search_url, device_id)


def set_reminder(message: str, delay_seconds: int = 60) -> Dict[str, Any]:
    remind_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=delay_seconds)
    return {"tool": "set_reminder", "ok": True, "message": message, "remind_at": remind_at.isoformat()}


def take_screenshot(device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "screenshot", {})
    return {"tool": "take_screenshot", "device_id": device_id, **result}


def adjust_volume(direction: str = "up", device_id: str | None = None) -> Dict[str, Any]:
    action = "volume_up" if direction == "up" else "volume_down"
    result = execute_for_device(device_id, action, {})
    return {"tool": "adjust_volume", "direction": direction, "device_id": device_id, **result}


def play_media(device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "play_media", {})
    return {"tool": "play_media", "device_id": device_id, **result}


def pause_media(device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "pause_media", {})
    return {"tool": "pause_media", "device_id": device_id, **result}


def scroll_page(direction: str = "down", device_id: str | None = None) -> Dict[str, Any]:
    action = "scroll_up" if direction == "up" else "scroll_down"
    result = execute_for_device(device_id, action, {})
    return {"tool": "scroll_page", "direction": direction, "device_id": device_id, **result}


def go_home(device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "go_home", {})
    return {"tool": "go_home", "device_id": device_id, **result}


def go_back(device_id: str | None = None) -> Dict[str, Any]:
    result = execute_for_device(device_id, "go_back", {})
    return {"tool": "go_back", "device_id": device_id, **result}


TOOLBOX: Dict[str, ToolSpec] = {
    "open_app": ToolSpec("open_app", "Open an app on a selected device", open_app),
    "search_youtube": ToolSpec("search_youtube", "Search YouTube by query", search_youtube),
    "send_message": ToolSpec("send_message", "Send a message to a contact", send_message),
    "transfer_device_context": ToolSpec("transfer_device_context", "Transfer a captured context between devices", transfer_device_context),
    "add_note": ToolSpec("add_note", "Add a note with title and content", add_note),
    "get_notes": ToolSpec("get_notes", "Retrieve all saved notes", get_notes),
    "open_link": ToolSpec("open_link", "Open a URL in the browser", open_link),
    "open_tab": ToolSpec("open_tab", "Open a URL in a new browser tab", open_tab),
    "web_search": ToolSpec("web_search", "Search the web for a query", web_search),
    "set_reminder": ToolSpec("set_reminder", "Set a reminder for later", set_reminder),
    "take_screenshot": ToolSpec("take_screenshot", "Take a screenshot of the screen", take_screenshot),
    "adjust_volume": ToolSpec("adjust_volume", "Adjust volume up or down", adjust_volume),
    "play_media": ToolSpec("play_media", "Play current media", play_media),
    "pause_media": ToolSpec("pause_media", "Pause current media", pause_media),
    "scroll_page": ToolSpec("scroll_page", "Scroll the page up or down", scroll_page),
    "go_home": ToolSpec("go_home", "Go to home screen", go_home),
    "go_back": ToolSpec("go_back", "Go back to previous screen", go_back),
}
