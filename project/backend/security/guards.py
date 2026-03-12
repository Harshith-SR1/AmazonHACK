from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import HTTPException, Request, WebSocket

# from security.cognito_auth import verify_cognito_token


RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "120"))
SECURITY_REQUIRE_AUTH = os.getenv("SECURITY_REQUIRE_AUTH", "true").lower() == "true"
SECURITY_API_KEYS = {k.strip() for k in os.getenv("SECURITY_API_KEYS", "").split(",") if k.strip()}
SECURITY_ALLOW_DEV_HEADERS = os.getenv("SECURITY_ALLOW_DEV_HEADERS", "true").lower() == "true"

_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)


def resolve_user_id(request: Request) -> str:
    if hasattr(request.state, "user_id") and request.state.user_id:
        return str(request.state.user_id)
    return request.headers.get("x-user-id", "anonymous").strip() or "anonymous"


def _resolve_identity(request: Request) -> Tuple[str, str]:
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        # Placeholder for AWS Cognito or generic JWT verification
        # user_id = verify_aws_cognito_token(token)
        pass

    if SECURITY_ALLOW_DEV_HEADERS:
        user_id = request.headers.get("x-user-id", "anonymous").strip() or "anonymous"
        principal = f"dev:{user_id}:{request.client.host if request.client else 'unknown'}"
        request.state.user_id = user_id
        return user_id, principal

    return "anonymous", "unknown"


def enforce_auth(request: Request) -> Tuple[str, str]:
    user_id, principal = _resolve_identity(request)
    api_key = request.headers.get("x-api-key", "")

    if SECURITY_REQUIRE_AUTH:
        bearer_present = request.headers.get("authorization", "").lower().startswith("bearer ")
        has_valid_api_key = api_key in SECURITY_API_KEYS if SECURITY_API_KEYS else bool(api_key)
        dev_header_auth = SECURITY_ALLOW_DEV_HEADERS and bool(request.headers.get("x-user-id")) and has_valid_api_key
        if not (bearer_present or has_valid_api_key or dev_header_auth):
            raise HTTPException(status_code=401, detail="Unauthorized: missing Bearer token or API key")

    now = time.time()
    bucket = _rate_buckets[principal]

    while bucket and now - bucket[0] > RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()

    if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    bucket.append(now)
    return user_id, principal


def enforce_websocket_auth(websocket: WebSocket) -> Tuple[str, str]:
    user_id = websocket.headers.get("x-user-id", "anonymous").strip() or "anonymous"
    api_key = websocket.headers.get("x-api-key", "")
    auth_header = websocket.headers.get("authorization", "")
    has_bearer = auth_header.lower().startswith("bearer ")

    if SECURITY_REQUIRE_AUTH and not (has_bearer or (SECURITY_API_KEYS and api_key in SECURITY_API_KEYS)):
        raise HTTPException(status_code=4401, detail="Unauthorized websocket")

    host = websocket.client.host if websocket.client else "unknown"
    principal = f"{user_id}:{host}"
    now = time.time()
    bucket = _rate_buckets[principal]

    while bucket and now - bucket[0] > RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()

    if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(status_code=4429, detail="Websocket rate limit exceeded")

    bucket.append(now)
    return user_id, principal
