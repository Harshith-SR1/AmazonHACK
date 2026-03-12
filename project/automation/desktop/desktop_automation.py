from __future__ import annotations

import os
import subprocess
import webbrowser
from typing import Any, Dict


def _safe_run(command: list[str]) -> Dict[str, Any]:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=12)
        return {
            "ok": completed.returncode == 0,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "command": command,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "command": command}


def open_app(app_name: str) -> Dict[str, Any]:
    name = app_name.lower().strip()
    if name in {"youtube", "yt"}:
        webbrowser.open("https://www.youtube.com")
        return {"ok": True, "mode": "browser", "target": "youtube"}
    if name in {"maps", "google maps"}:
        webbrowser.open("https://maps.google.com")
        return {"ok": True, "mode": "browser", "target": "maps"}
    if name in {"browser", "chrome", "edge"}:
        webbrowser.open("https://www.google.com")
        return {"ok": True, "mode": "browser", "target": "default-browser"}

    if name in {"notepad", "calculator", "calc"}:
        executable = "notepad.exe" if name == "notepad" else "calc.exe"
        result = _safe_run(["cmd", "/c", "start", "", executable])
        result["target"] = executable
        return result

    if os.path.exists(app_name):
        result = _safe_run(["cmd", "/c", "start", "", app_name])
        result["target"] = app_name
        return result

    return {"ok": False, "error": f"Unsupported desktop app: {app_name}"}


def open_url(url: str) -> Dict[str, Any]:
    webbrowser.open(url)
    return {"ok": True, "mode": "browser", "url": url}


def search_youtube(query: str) -> Dict[str, Any]:
    url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"
    webbrowser.open(url)
    return {"ok": True, "mode": "browser", "url": url, "query": query}


def send_message(contact: str, message: str) -> Dict[str, Any]:
    encoded_message = message.replace(" ", "%20")
    if contact.startswith("+") or contact.isdigit():
        webbrowser.open(f"https://web.whatsapp.com/send?phone={contact}&text={encoded_message}")
        return {"ok": True, "mode": "whatsapp-web", "contact": contact}

    webbrowser.open(f"mailto:{contact}?subject=OmniAccess&body={encoded_message}")
    return {"ok": True, "mode": "mailto", "contact": contact}


def key_action(action: str) -> Dict[str, Any]:
    try:
        import importlib

        pyautogui = importlib.import_module("pyautogui")
        if action == "confirm":
            pyautogui.press("enter")
        elif action == "cancel":
            pyautogui.press("esc")
        else:
            return {"ok": False, "error": f"Unsupported key action: {action}"}
        return {"ok": True, "mode": "pyautogui", "action": action}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "action": action, "mode": "pyautogui"}


def run_desktop_action(action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if action == "open_app":
        return open_app(payload.get("app_name", ""))
    if action == "open_url":
        return open_url(payload.get("url", "https://www.google.com"))
    if action == "search_youtube":
        return search_youtube(payload.get("query", "trending"))
    if action == "send_message":
        return send_message(payload.get("contact", ""), payload.get("message", ""))
    if action in {"confirm", "cancel"}:
        return key_action(action)

    return {"ok": False, "error": f"Unsupported desktop action: {action}", "action": action}
