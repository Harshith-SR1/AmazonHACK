from __future__ import annotations

import os
import sqlite3
from contextlib import closing

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "memory", "omniaccess.db")


def init_audit() -> None:
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT DEFAULT CURRENT_TIMESTAMP,
                user_id TEXT NOT NULL,
                principal TEXT NOT NULL,
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL
            )
            """
        )
        conn.commit()


def log_audit(user_id: str, principal: str, method: str, path: str, status_code: int, duration_ms: int) -> None:
    init_audit()
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_logs(user_id, principal, method, path, status_code, duration_ms) VALUES(?, ?, ?, ?, ?, ?)",
            (user_id, principal, method, path, status_code, duration_ms),
        )
        conn.commit()
