from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from typing import Any, Dict, List

from dotenv import load_dotenv
from cloud.aws.dynamodb_client import DynamoDBClient

load_dotenv()

_DYNAMO_CLIENT = None
_DYNAMO_INIT_ATTEMPTED = False

DB_PATH = os.path.join(os.path.dirname(__file__), "omniaccess.db")
_SCHEMA_READY = False


def _get_dynamo_client() -> DynamoDBClient | None:
    global _DYNAMO_CLIENT, _DYNAMO_INIT_ATTEMPTED
    if _DYNAMO_INIT_ATTEMPTED:
        return _DYNAMO_CLIENT

    _DYNAMO_INIT_ATTEMPTED = True
    try:
        candidate = DynamoDBClient()
        if getattr(candidate, "available", False):
            _DYNAMO_CLIENT = candidate
    except Exception as exc:
        print(f"DynamoDB unavailable, falling back to SQLite: {exc}")
        _DYNAMO_CLIENT = None
    return _DYNAMO_CLIENT


def _ensure_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    init_memory()
    _SCHEMA_READY = True


def init_memory() -> None:
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS personal_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'anonymous',
                key TEXT NOT NULL,
                value TEXT NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS gesture_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'anonymous',
                name TEXT NOT NULL,
                landmarks TEXT NOT NULL,
                mapped_task TEXT NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS context_transfer (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'anonymous',
                context_id TEXT NOT NULL,
                source_device TEXT NOT NULL,
                target_device TEXT,
                payload TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS sign_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'anonymous',
                label TEXT NOT NULL,
                vector TEXT NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'desktop',
                online INTEGER NOT NULL DEFAULT 1,
                last_seen REAL NOT NULL DEFAULT 0,
                paired_at REAL NOT NULL DEFAULT 0
            )
            """
        )

        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_user_key ON personal_memory(user_id, key)"
        )
        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_gesture_user_name ON gesture_library(user_id, name)"
        )
        conn.commit()


def set_personal_preference(user_id: str, key: str, value: str) -> None:
    dynamo = _get_dynamo_client()
    if dynamo and dynamo.put_item(user_id, key, value, category="preference"):
        return

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO personal_memory(user_id, key, value) VALUES(?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value",
            (user_id, key, value),
        )
        conn.commit()


def get_personal_memory(user_id: str) -> List[Dict[str, Any]]:
    dynamo = _get_dynamo_client()
    if dynamo:
        items = dynamo.list_items_by_category(user_id, "preference")
        return [{"key": item['key'], "value": item['value']} for item in items]

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        rows = cur.execute("SELECT key, value FROM personal_memory WHERE user_id=?", (user_id,)).fetchall()
        return [{"key": key, "value": value} for key, value in rows]


def save_gesture(user_id: str, name: str, landmarks: str, mapped_task: str) -> None:
    dynamo = _get_dynamo_client()
    if dynamo and dynamo.put_item(
        user_id, name, {"landmarks": landmarks, "mapped_task": mapped_task}, category="gesture"
    ):
        return

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO gesture_library(user_id, name, landmarks, mapped_task) VALUES(?, ?, ?, ?) ON CONFLICT(user_id, name) DO UPDATE SET landmarks=excluded.landmarks, mapped_task=excluded.mapped_task",
            (user_id, name, landmarks, mapped_task),
        )
        conn.commit()


def list_gestures(user_id: str) -> List[Dict[str, Any]]:
    dynamo = _get_dynamo_client()
    if dynamo:
        items = dynamo.list_items_by_category(user_id, "gesture")
        return [{"name": item['key'], "landmarks": item['value']['landmarks'], "mapped_task": item['value']['mapped_task']} for item in items]

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        rows = cur.execute(
            "SELECT name, landmarks, mapped_task FROM gesture_library WHERE user_id=?", (user_id,)
        ).fetchall()
        return [{"name": name, "landmarks": landmarks, "mapped_task": mapped_task} for name, landmarks, mapped_task in rows]


def delete_gesture(user_id: str, name: str) -> bool:
    dynamo = _get_dynamo_client()
    if dynamo:
        dynamo.delete_item(user_id, name)
        return True

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM gesture_library WHERE user_id=? AND name=?", (user_id, name)
        )
        conn.commit()
        return cur.rowcount > 0


def save_context_transfer(
    user_id: str, context_id: str, source_device: str, target_device: str | None, payload: str
) -> None:
    dynamo = _get_dynamo_client()
    if dynamo and dynamo.put_item(
        user_id,
        context_id,
        {
            "source_device": source_device,
            "target_device": target_device,
            "payload": payload,
        },
        category="context",
    ):
        return

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO context_transfer(user_id, context_id, source_device, target_device, payload) VALUES(?, ?, ?, ?, ?)",
            (user_id, context_id, source_device, target_device, payload),
        )
        conn.commit()


def get_latest_context_payload(user_id: str, context_id: str) -> Dict[str, Any] | None:
    dynamo = _get_dynamo_client()
    if dynamo:
        item = dynamo.get_item(user_id, context_id, category="context")
        if not item: return None
        try:
            import json
            payload = item['value'].get('payload')
            return json.loads(payload) if isinstance(payload, str) else payload
        except Exception: return None

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        row = cur.execute(
            """
            SELECT payload FROM context_transfer
            WHERE user_id=? AND context_id=?
            ORDER BY id DESC LIMIT 1
            """,
            (user_id, context_id),
        ).fetchone()
        if not row:
            return None
        try:
            import json

            return json.loads(row[0]) if row[0] else None
        except Exception:
            return None


def save_sign_sample(user_id: str, label: str, vector: str) -> None:
    dynamo = _get_dynamo_client()
    if dynamo and dynamo.put_item(user_id, f"sample_{label}", vector, category="sign"):
        return

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO sign_samples(user_id, label, vector) VALUES(?, ?, ?)", (user_id, label, vector))
        conn.commit()


def list_sign_samples(user_id: str) -> List[Dict[str, Any]]:
    dynamo = _get_dynamo_client()
    if dynamo:
        items = dynamo.list_items_by_category(user_id, "sign")
        return [{"label": item['key'].replace("sample_", ""), "vector": item['value']} for item in items]

    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        rows = cur.execute("SELECT label, vector FROM sign_samples WHERE user_id=?", (user_id,)).fetchall()
        return [{"label": label, "vector": vector} for label, vector in rows]


# ── Persistent Device Registry ──────────────────────────────────

import time as _time


def get_all_devices() -> List[Dict[str, Any]]:
    """Return all registered devices."""
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        rows = cur.execute("SELECT id, name, type, online, last_seen, paired_at FROM devices ORDER BY paired_at").fetchall()
        return [
            {"id": r[0], "name": r[1], "type": r[2], "online": bool(r[3]), "last_seen": r[4], "paired_at": r[5]}
            for r in rows
        ]


def upsert_device(device_id: str, name: str, dtype: str, online: bool = True) -> None:
    """Insert or update a device entry."""
    _ensure_schema()
    now = _time.time()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO devices(id, name, type, online, last_seen, paired_at)
               VALUES(?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, online=excluded.online, last_seen=excluded.last_seen""",
            (device_id, name, dtype, int(online), now, now),
        )
        conn.commit()


def remove_device(device_id: str) -> bool:
    """Remove a device. Returns True if a row was deleted."""
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM devices WHERE id=?", (device_id,))
        conn.commit()
        return cur.rowcount > 0


def set_device_online(device_id: str, online: bool) -> None:
    """Update online status and last_seen timestamp."""
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE devices SET online=?, last_seen=? WHERE id=?",
            (int(online), _time.time(), device_id),
        )
        conn.commit()


def device_heartbeat(device_id: str) -> None:
    """Touch last_seen and mark online."""
    set_device_online(device_id, True)
