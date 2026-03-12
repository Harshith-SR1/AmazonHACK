from __future__ import annotations

import json
import math
from collections import Counter
from typing import Dict, List, Optional

import numpy as np

from memory.memory_store import list_sign_samples, save_sign_sample


# ── ASL Static Sign Vocabulary ──────────────────────────────────────
# Each entry maps a sign label to:
#   - action: what the agent should do when this sign is recognised
#   - description: human-readable meaning
#   - finger_profile: simplified finger-state descriptor used for
#     rule-based bootstrapping (before the user records real samples).
#     Format: [thumb, index, middle, ring, pinky] where
#       1 = extended, 0 = folded

ASL_VOCABULARY: Dict[str, dict] = {
    "hello":       {"action": "greet",           "description": "Wave / greeting",                   "finger_profile": [1, 1, 1, 1, 1]},
    "yes":         {"action": "confirm",         "description": "Fist nod — affirmative",            "finger_profile": [0, 0, 0, 0, 0]},
    "no":          {"action": "cancel",          "description": "Index+middle snap — negative",      "finger_profile": [0, 1, 1, 0, 0]},
    "thank_you":   {"action": "acknowledge",     "description": "Flat hand from chin forward",       "finger_profile": [1, 1, 1, 1, 1]},
    "please":      {"action": "request",         "description": "Flat hand circles on chest",        "finger_profile": [1, 1, 1, 1, 1]},
    "stop":        {"action": "stop",            "description": "Open palm forward — halt",          "finger_profile": [1, 1, 1, 1, 1]},
    "go":          {"action": "navigate",        "description": "Point forward — proceed",           "finger_profile": [0, 1, 0, 0, 0]},
    "up":          {"action": "scroll_up",       "description": "Index pointing up",                 "finger_profile": [0, 1, 0, 0, 0]},
    "down":        {"action": "scroll_down",     "description": "Index pointing down",               "finger_profile": [0, 1, 0, 0, 0]},
    "open":        {"action": "open_app",        "description": "Spread open hand — launch",         "finger_profile": [1, 1, 1, 1, 1]},
    "close":       {"action": "cancel",          "description": "Closing fist — dismiss",            "finger_profile": [0, 0, 0, 0, 0]},
    "search":      {"action": "search",          "description": "Circle with thumb+index — look up", "finger_profile": [1, 1, 0, 0, 0]},
    "play":        {"action": "play_media",      "description": "Thumb up — play",                   "finger_profile": [1, 0, 0, 0, 0]},
    "pause":       {"action": "pause_media",     "description": "Open palm — pause/stop",            "finger_profile": [1, 1, 1, 1, 1]},
    "next":        {"action": "next_item",       "description": "Swipe right — next",                "finger_profile": [0, 1, 1, 0, 0]},
    "back":        {"action": "go_back",         "description": "Thumb pointing back",               "finger_profile": [1, 0, 0, 0, 0]},
    "volume_up":   {"action": "volume_up",       "description": "Fist rising — louder",              "finger_profile": [0, 0, 0, 0, 0]},
    "volume_down": {"action": "volume_down",     "description": "Fist lowering — quieter",           "finger_profile": [0, 0, 0, 0, 0]},
    "like":        {"action": "thumbs_up",       "description": "Thumbs up — positive feedback",     "finger_profile": [1, 0, 0, 0, 0]},
    "dislike":     {"action": "thumbs_down",     "description": "Thumbs down — negative feedback",   "finger_profile": [1, 0, 0, 0, 0]},
    "call":        {"action": "start_call",      "description": "Thumb+pinky phone shape",           "finger_profile": [1, 0, 0, 0, 1]},
    "message":     {"action": "send_message",    "description": "Typing gesture — open messaging",   "finger_profile": [0, 1, 1, 0, 0]},
    "photo":       {"action": "take_photo",      "description": "Frame with hands — camera",         "finger_profile": [1, 1, 0, 0, 0]},
    "home":        {"action": "go_home",         "description": "Flat hand on chest — home screen",  "finger_profile": [1, 1, 1, 1, 1]},
}

# Reverse lookup: action → sign label
ACTION_TO_SIGN: Dict[str, str] = {v["action"]: k for k, v in ASL_VOCABULARY.items()}


def get_vocabulary() -> Dict[str, dict]:
    """Return the full sign vocabulary with action mappings."""
    return ASL_VOCABULARY


def get_sign_action(label: str) -> Optional[str]:
    """Return the agent action string for a recognised sign label, or None."""
    entry = ASL_VOCABULARY.get(label.lower().strip())
    return entry["action"] if entry else None


# ── Landmark helpers ────────────────────────────────────────────────

def _flatten_landmarks(landmarks: List[List[float]]) -> np.ndarray:
    arr = np.array(landmarks, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[0] != 21:
        raise ValueError(f"Expected (21, 2|3) landmarks, got {arr.shape}")
    return arr.reshape(-1)


def _normalise_landmarks(landmarks: List[List[float]]) -> np.ndarray:
    """Translate so wrist=origin, scale so max extent=1."""
    arr = np.array(landmarks, dtype=np.float32)
    wrist = arr[0].copy()
    arr = arr - wrist  # translate
    extent = np.max(np.abs(arr))
    if extent > 1e-6:
        arr = arr / extent
    return arr.reshape(-1)


def _finger_states(landmarks: List[List[float]]) -> List[int]:
    """Return [thumb, index, middle, ring, pinky] as 1=extended, 0=folded."""
    tip_ids = [4, 8, 12, 16, 20]
    mcp_ids = [2, 5, 9, 13, 17]  # use IP/MCP joint as reference
    states = []
    for tip, mcp in zip(tip_ids, mcp_ids):
        # Y axis is inverted in screen coords (lower y = higher on screen)
        extended = landmarks[tip][1] < landmarks[mcp][1]
        states.append(1 if extended else 0)
    return states


# ── Rule-based bootstrap classifier ────────────────────────────────
# Works when no user-trained samples exist yet.

def _rule_based_predict(landmarks: List[List[float]]) -> Optional[dict]:
    """Attempt to classify using finger-state profiles from the vocabulary."""
    states = _finger_states(landmarks)
    
    # Find all matching profiles
    matches = []
    for label, info in ASL_VOCABULARY.items():
        profile = info["finger_profile"]
        distance = sum(abs(a - b) for a, b in zip(states, profile))
        if distance <= 1:  # allow 1 finger tolerance
            matches.append((distance, label, info))

    if not matches:
        return None

    matches.sort(key=lambda x: x[0])
    best_dist, best_label, best_info = matches[0]
    confidence = max(0.3, 1.0 - best_dist * 0.25)

    return {
        "ok": True,
        "predicted_label": best_label,
        "confidence": round(confidence, 4),
        "action": best_info["action"],
        "method": "rule_based",
        "description": best_info["description"],
    }


# ── Training ────────────────────────────────────────────────────────

def train_sign(user_id: str, label: str, landmarks: List[List[float]]) -> dict:
    """Store a normalised landmark sample for the given label."""
    vector = _normalise_landmarks(landmarks)
    save_sign_sample(user_id, label.lower().strip(), json.dumps(vector.tolist()))
    return {
        "ok": True,
        "label": label,
        "dimensions": int(vector.shape[0]),
        "action": get_sign_action(label),
    }


def bulk_train(user_id: str, samples: List[dict]) -> dict:
    """Train multiple sign samples at once.
    
    Each item in samples: {"label": str, "landmarks": [[x,y,z], ...]}
    """
    results = []
    for item in samples:
        label = item.get("label", "")
        lm = item.get("landmarks", [])
        if not label or not lm:
            results.append({"ok": False, "label": label, "error": "missing data"})
            continue
        try:
            r = train_sign(user_id, label, lm)
            results.append(r)
        except Exception as exc:
            results.append({"ok": False, "label": label, "error": str(exc)})
    success = sum(1 for r in results if r.get("ok"))
    return {"ok": True, "trained": success, "total": len(samples), "details": results}


# ── Prediction ──────────────────────────────────────────────────────

def predict_sign(user_id: str, landmarks: List[List[float]], k: int = 3) -> dict:
    """Predict sign label using k-NN over stored samples.

    Falls back to rule-based classification if no trained samples exist.
    """
    query = _normalise_landmarks(landmarks)
    samples = list_sign_samples(user_id)

    # Fallback: rule-based when no trained data
    if not samples:
        rule_result = _rule_based_predict(landmarks)
        if rule_result:
            return rule_result
        return {"ok": False, "error": "No sign samples trained yet. Use the training screen or POST /api/sign/train."}

    distances = []
    for sample in samples:
        vector = np.array(json.loads(sample["vector"]), dtype=np.float32)
        if vector.shape != query.shape:
            continue
        dist = float(np.linalg.norm(vector - query))
        distances.append((dist, sample["label"]))

    if not distances:
        # Stored samples have different dimensionality — try rule-based
        rule_result = _rule_based_predict(landmarks)
        if rule_result:
            return rule_result
        return {"ok": False, "error": "No compatible samples for landmark size"}

    nearest = sorted(distances, key=lambda x: x[0])[: max(1, k)]
    labels = [label for _, label in nearest]
    top_label, votes = Counter(labels).most_common(1)[0]
    confidence = votes / len(nearest)

    # Boost confidence if rule-based agrees
    rule = _rule_based_predict(landmarks)
    if rule and rule["predicted_label"] == top_label:
        confidence = min(1.0, confidence + 0.15)

    action = get_sign_action(top_label)

    return {
        "ok": True,
        "predicted_label": top_label,
        "confidence": round(confidence, 4),
        "action": action,
        "method": "knn",
        "nearest": [{"distance": round(d, 4), "label": l} for d, l in nearest],
    }


def get_user_sign_stats(user_id: str) -> dict:
    """Return training statistics for the user's sign samples."""
    samples = list_sign_samples(user_id)
    label_counts: Dict[str, int] = {}
    for s in samples:
        label_counts[s["label"]] = label_counts.get(s["label"], 0) + 1

    vocab_labels = set(ASL_VOCABULARY.keys())
    trained_labels = set(label_counts.keys())

    return {
        "total_samples": len(samples),
        "unique_labels": len(trained_labels),
        "vocabulary_size": len(vocab_labels),
        "trained": {k: v for k, v in sorted(label_counts.items())},
        "untrained": sorted(vocab_labels - trained_labels),
    }
