from __future__ import annotations

import subprocess
from typing import Any, Dict


def _adb_shell(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["adb", "shell", *args], capture_output=True, text=True, timeout=15)


def run_adb_action(action: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Execute a best-effort mobile action through adb."""
    data = payload or {}
    action_name = (action or "").strip().lower()

    try:
        if action_name == "click":
            coords = data.get("coords") or [500, 1000]
            x = int(coords[0]) if isinstance(coords, list) and len(coords) > 0 else 500
            y = int(coords[1]) if isinstance(coords, list) and len(coords) > 1 else 1000
            cp = _adb_shell(["input", "tap", str(x), str(y)])
            return {"ok": cp.returncode == 0, "action": action_name, "stdout": cp.stdout.strip(), "stderr": cp.stderr.strip()}

        if action_name == "scroll":
            cp = _adb_shell(["input", "swipe", "500", "1400", "500", "500", "250"])
            return {"ok": cp.returncode == 0, "action": action_name, "stdout": cp.stdout.strip(), "stderr": cp.stderr.strip()}

        if action_name == "type":
            text = str(data.get("text", "")).replace(" ", "%s")
            cp = _adb_shell(["input", "text", text])
            return {"ok": cp.returncode == 0, "action": action_name, "stdout": cp.stdout.strip(), "stderr": cp.stderr.strip()}

        if action_name in {"confirm", "enter"}:
            cp = _adb_shell(["input", "keyevent", "66"])
            return {"ok": cp.returncode == 0, "action": action_name, "stdout": cp.stdout.strip(), "stderr": cp.stderr.strip()}

        if action_name == "cancel":
            cp = _adb_shell(["input", "keyevent", "4"])
            return {"ok": cp.returncode == 0, "action": action_name, "stdout": cp.stdout.strip(), "stderr": cp.stderr.strip()}

        if action_name == "screenshot":
            import base64, tempfile, os
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.close()
            # Capture on device, pull to host
            _adb_shell(["screencap", "-p", "/sdcard/_omni_screenshot.png"])
            pull = subprocess.run(
                ["adb", "pull", "/sdcard/_omni_screenshot.png", tmp.name],
                capture_output=True, text=True, timeout=15,
            )
            if pull.returncode != 0:
                os.unlink(tmp.name)
                return {"ok": False, "action": action_name, "error": f"adb pull failed: {pull.stderr.strip()}"}
            with open(tmp.name, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            os.unlink(tmp.name)
            _adb_shell(["rm", "/sdcard/_omni_screenshot.png"])
            return {"ok": True, "action": action_name, "screenshot_base64": b64}

        return {"ok": False, "action": action_name, "error": "unsupported action", "payload": data}
    except Exception as exc:
        return {"ok": False, "action": action_name, "error": str(exc), "payload": data}
