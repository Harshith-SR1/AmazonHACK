from __future__ import annotations

from typing import Dict


STATIC_GESTURE_MAP: Dict[str, str] = {
    "open_palm": "scroll",
    "pinch": "click",
    "swipe": "navigate",
    "fist": "capture_context",
    "thumbs_up": "confirm",
    "two_fingers": "cancel",
}


def map_gesture_to_action(gesture_name: str) -> str:
    return STATIC_GESTURE_MAP.get(gesture_name, "unknown")
