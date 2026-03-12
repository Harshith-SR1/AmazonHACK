from __future__ import annotations

from typing import Any, Dict

from tools.automation_controller import execute_for_device


def continue_context_on_device(target_device: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not payload:
        return {"ok": False, "error": "Missing captured payload for continuation"}

    if payload.get("url"):
        return execute_for_device(target_device, "open_url", {"url": payload["url"]})

    if payload.get("youtube_query"):
        return execute_for_device(target_device, "search_youtube", {"query": payload["youtube_query"]})

    if payload.get("app_name"):
        return execute_for_device(target_device, "open_app", {"app_name": payload["app_name"]})

    if payload.get("contact") and payload.get("message"):
        return execute_for_device(
            target_device,
            "send_message",
            {"contact": payload["contact"], "message": payload["message"]},
        )

    return {"ok": False, "error": "No actionable continuation payload found"}
