from __future__ import annotations

import shutil
import subprocess
from typing import Dict


def _run(args: list[str]) -> Dict[str, str | bool]:
    try:
        completed = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return {
            "ok": completed.returncode == 0,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except Exception as exc:
        return {"ok": False, "stdout": "", "stderr": str(exc)}


def mobile_reliability_check(serial: str | None = None) -> dict:
    adb_path = shutil.which("adb")
    if not adb_path:
        return {"ok": False, "stage": "precheck", "error": "adb not found in PATH"}

    base = [adb_path]
    if serial:
        base.extend(["-s", serial])

    state = _run([*base, "get-state"])
    device = _run([*base, "shell", "getprop", "ro.product.model"])
    battery = _run([*base, "shell", "dumpsys", "battery"])

    is_device = bool(state.get("ok")) and "device" in str(state.get("stdout", "")).lower()
    return {
        "ok": is_device,
        "adb_present": True,
        "device_state": state,
        "device_model": device,
        "battery": battery,
        "recommendation": "Run app foreground and keep USB debugging enabled for stable automation.",
    }
