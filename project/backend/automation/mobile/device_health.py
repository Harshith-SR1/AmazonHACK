from __future__ import annotations

import subprocess
from typing import Any, Dict


def mobile_reliability_check(serial: str | None = None) -> Dict[str, Any]:
    """Return basic ADB connectivity diagnostics for mobile automation."""
    cmd = ["adb"]
    if serial:
        cmd += ["-s", serial]
    cmd += ["get-state"]

    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        state = (cp.stdout or "").strip() or (cp.stderr or "").strip()
        ok = cp.returncode == 0 and "device" in state.lower()
        return {
            "ok": ok,
            "serial": serial,
            "adb_state": state,
            "returncode": cp.returncode,
        }
    except Exception as exc:
        return {
            "ok": False,
            "serial": serial,
            "error": str(exc),
        }
