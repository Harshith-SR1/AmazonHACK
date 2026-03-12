from __future__ import annotations

import subprocess
from typing import Any, Dict


def _adb(serial: str | None, args: list[str]) -> Dict[str, Any]:
    command = ["adb"]
    if serial:
        command.extend(["-s", serial])
    command.extend(args)
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=12)
        return {
            "ok": completed.returncode == 0,
            "command": command,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "command": command}


def _view_url(serial: str | None, url: str) -> Dict[str, Any]:
    return _adb(serial, ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url])


def _open_app(serial: str | None, app_name: str) -> Dict[str, Any]:
    app = app_name.lower().strip()
    if app in {"youtube", "yt"}:
        return _adb(serial, ["shell", "monkey", "-p", "com.google.android.youtube", "-c", "android.intent.category.LAUNCHER", "1"])
    if app in {"maps", "google maps"}:
        return _adb(serial, ["shell", "monkey", "-p", "com.google.android.apps.maps", "-c", "android.intent.category.LAUNCHER", "1"])
    if app in {"browser", "chrome"}:
        return _adb(serial, ["shell", "monkey", "-p", "com.android.chrome", "-c", "android.intent.category.LAUNCHER", "1"])
    return {"ok": False, "error": f"Unsupported mobile app: {app_name}"}


def _search_youtube(serial: str | None, query: str) -> Dict[str, Any]:
    return _view_url(serial, f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}")


def _send_message(serial: str | None, contact: str, message: str) -> Dict[str, Any]:
    destination = contact if contact.startswith("+") or contact.isdigit() else ""
    if destination:
        return _adb(
            serial,
            [
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.SENDTO",
                "-d",
                f"sms:{destination}",
                "--es",
                "sms_body",
                message,
            ],
        )

    return _view_url(serial, f"https://web.whatsapp.com/send?text={message.replace(' ', '%20')}")


def run_adb_action(action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    serial = payload.get("serial")

    if action == "open_app":
        return _open_app(serial, payload.get("app_name", ""))
    if action == "open_url":
        return _view_url(serial, payload.get("url", "https://www.google.com"))
    if action == "search_youtube":
        return _search_youtube(serial, payload.get("query", "trending"))
    if action == "send_message":
        return _send_message(serial, payload.get("contact", ""), payload.get("message", ""))
    if action == "confirm":
        return _adb(serial, ["shell", "input", "keyevent", "66"])
    if action == "cancel":
        return _adb(serial, ["shell", "input", "keyevent", "4"])

    command = payload.get("command")
    if command:
        return _adb(serial, command.split())
    return {"ok": False, "error": f"Unsupported mobile action: {action}"}
