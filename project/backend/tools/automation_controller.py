from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from automation.desktop.desktop_automation import run_desktop_action
from automation.mobile.adb_automation import run_adb_action


def execute_for_device(device_id: str | None, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if device_id and device_id.startswith("phone"):
        result = run_adb_action(action, payload)
        return {"engine": "adb", "action": action, "device_id": device_id, **result}

    result = run_desktop_action(action, payload)
    return {"engine": "desktop", "action": action, "device_id": device_id or "desktop-1", **result}
