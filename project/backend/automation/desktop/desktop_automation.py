from __future__ import annotations

import subprocess
import webbrowser
from typing import Any, Dict

# Map common app names to URLs for desktop browser-based launching
_APP_URLS: Dict[str, str] = {
    "youtube": "https://www.youtube.com",
    "gmail": "https://mail.google.com",
    "google": "https://www.google.com",
    "maps": "https://maps.google.com",
    "calendar": "https://calendar.google.com",
    "twitter": "https://twitter.com",
    "reddit": "https://www.reddit.com",
    "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com",
    "linkedin": "https://www.linkedin.com",
    "discord": "https://discord.com/app",
    "slack": "https://app.slack.com",
    "spotify": "https://open.spotify.com",
    "netflix": "https://www.netflix.com",
    "amazon": "https://www.amazon.com",
    "whatsapp": "https://web.whatsapp.com",
    "telegram": "https://web.telegram.org",
    "tiktok": "https://www.tiktok.com",
    "pinterest": "https://www.pinterest.com",
    "news": "https://news.google.com",
    "weather": "https://weather.com",
    "music": "https://music.youtube.com",
}


def run_desktop_action(action: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Execute a best-effort desktop action with graceful fallback."""
    data = payload or {}
    action_name = (action or "").strip().lower()

    # ── Actions that don't require pyautogui ───────────────────
    if action_name == "open_app":
        app = str(data.get("app_name", "")).lower()
        url = _APP_URLS.get(app)
        if url:
            webbrowser.open(url)
            return {"ok": True, "action": action_name, "app_name": app, "opened_url": url}
        # Unknown app — don't guess random URLs
        return {"ok": False, "action": action_name, "error": f"Unknown app: {app}. Add it to the supported apps list."}

    if action_name == "search_youtube":
        import urllib.parse
        query = str(data.get("query", "trending"))
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(query)}"
        webbrowser.open(url)
        return {"ok": True, "action": action_name, "query": query, "opened_url": url}

    if action_name == "open_link":
        url = str(data.get("url", ""))
        if url:
            webbrowser.open(url)
            return {"ok": True, "action": action_name, "url": url}
        return {"ok": False, "action": action_name, "error": "no url provided"}

    if action_name == "open_tab":
        url = str(data.get("url", "about:newtab"))
        webbrowser.open_new_tab(url)
        return {"ok": True, "action": action_name, "url": url}

    if action_name == "send_message":
        contact = data.get("contact", "")
        message = data.get("message", "")
        return {"ok": True, "action": action_name, "contact": contact, "message": message, "note": "queued (demo)"}

    # ── Actions that need pyautogui ────────────────────────────
    try:
        import pyautogui  # type: ignore
    except Exception as exc:
        return {"ok": False, "action": action_name, "error": f"pyautogui unavailable: {exc}", "payload": data}

    try:
        if action_name == "click":
            coords = data.get("coords") or [None, None]
            x = coords[0] if isinstance(coords, list) and len(coords) > 0 else None
            y = coords[1] if isinstance(coords, list) and len(coords) > 1 else None
            if x is not None and y is not None:
                pyautogui.click(x=int(x), y=int(y))
            else:
                pyautogui.click()
            return {"ok": True, "action": action_name}

        if action_name == "scroll":
            amount = int(data.get("amount", -500))
            pyautogui.scroll(amount)
            return {"ok": True, "action": action_name, "amount": amount}

        if action_name == "scroll_down":
            pyautogui.scroll(-5)
            return {"ok": True, "action": action_name}

        if action_name == "scroll_up":
            pyautogui.scroll(5)
            return {"ok": True, "action": action_name}

        if action_name == "type":
            text = str(data.get("text", ""))
            if text:
                pyautogui.typewrite(text)
                return {"ok": True, "action": action_name, "text_len": len(text)}
            return {"ok": False, "action": action_name, "error": "missing text"}

        if action_name in {"confirm", "enter"}:
            pyautogui.press("enter")
            return {"ok": True, "action": action_name}

        if action_name == "cancel":
            pyautogui.press("esc")
            return {"ok": True, "action": action_name}

        if action_name == "screenshot":
            import io, base64
            screenshot = pyautogui.screenshot()
            buf = io.BytesIO()
            screenshot.save(buf, format="JPEG", quality=70)
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            return {"ok": True, "action": action_name, "screenshot_base64": b64}

        if action_name == "play_media":
            pyautogui.press("playpause")
            return {"ok": True, "action": action_name}

        if action_name == "pause_media":
            pyautogui.press("playpause")
            return {"ok": True, "action": action_name}

        if action_name == "volume_up":
            pyautogui.press("volumeup")
            return {"ok": True, "action": action_name}

        if action_name == "volume_down":
            pyautogui.press("volumedown")
            return {"ok": True, "action": action_name}

        if action_name == "go_home":
            pyautogui.hotkey("win", "d")
            return {"ok": True, "action": action_name}

        if action_name == "go_back":
            pyautogui.hotkey("alt", "left")
            return {"ok": True, "action": action_name}

        return {"ok": False, "action": action_name, "error": "unsupported action", "payload": data}
    except Exception as exc:
        return {"ok": False, "action": action_name, "error": str(exc), "payload": data}
