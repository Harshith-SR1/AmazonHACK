import os
import json
import base64
import time
from typing import Any, Dict, List, Optional
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage
from tools.automation_controller import execute_for_device


class NovaActEngine:
    """Specialized engine for UI automation using Amazon Nova Act.

    Captures real screenshots via pyautogui (desktop) or adb (mobile),
    sends them to Nova for visual reasoning, then dispatches the resulting
    action back through the automation layer.
    """

    def __init__(self) -> None:
        self.model_id = os.getenv("NOVA_ACT_MODEL_ID", "amazon.nova-act-v1:0")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self._llm: Optional[ChatBedrockConverse] = None

    def _has_explicit_aws_credentials(self) -> bool:
        access_key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        secret_key = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
        if not access_key or not secret_key:
            return False
        if access_key.lower().startswith("your_") or secret_key.lower().startswith("your_"):
            return False
        return True

    def _get_llm(self) -> Optional[ChatBedrockConverse]:
        if self._llm is None:
            if not self._has_explicit_aws_credentials():
                return None
            try:
                self._llm = ChatBedrockConverse(
                    model_id=self.model_id,
                    region_name=self.region,
                )
            except Exception as e:
                print(f"Nova Act LLM init error: {e}")
                self._llm = None
        return self._llm

    # ------------------------------------------------------------------
    # Screenshot capture — delegates to existing automation layer
    # ------------------------------------------------------------------
    def _capture_screenshot(self, device_id: str | None) -> str:
        """Return a base64-encoded JPEG/PNG of the current screen."""
        result = execute_for_device(device_id, "screenshot", {})
        b64 = result.get("screenshot_base64", "")
        if not b64:
            raise RuntimeError(
                f"Screenshot capture failed on {device_id or 'desktop'}: "
                f"{result.get('error', 'empty response')}"
            )
        return b64

    # ------------------------------------------------------------------
    # Single-step: screenshot → LLM → action
    # ------------------------------------------------------------------
    def analyze_ui_and_execute(
        self,
        screenshot_base64: str,
        goal: str,
        device_id: str | None = None,
    ) -> Dict[str, Any]:
        """Analyse a screenshot, decide the next UI action, and execute it."""

        prompt = (
            f"Goal: {goal}\n\n"
            "Look at the attached UI screenshot and decide the single NEXT "
            "action to reach the goal. Respond with **only** a JSON object:\n"
            '{"action":"click|type|scroll|wait|done",'
            '"element":"<description>",'
            '"coords":[x,y],'
            '"text":"<text to type if action==type>",'
            '"reason":"<why>"}\n'
            "coords are pixel offsets from top-left.  If the goal is already "
            'achieved, return {"action":"done","reason":"..."}.'
        )

        try:
            llm = self._get_llm()
            message = HumanMessage(
                content=[
                    {"type": "text", "text": prompt},
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": screenshot_base64,
                        },
                    },
                ]
            )

            response = llm.invoke([message])
            raw = response.content
            if isinstance(raw, str):
                raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
            action_json = json.loads(raw)

            return self._dispatch_action(action_json, device_id)

        except json.JSONDecodeError as exc:
            return {"ok": False, "error": f"LLM returned non-JSON: {exc}", "raw": raw[:300]}
        except Exception as exc:
            return {"ok": False, "error": f"Nova Act failure: {exc}"}

    # ------------------------------------------------------------------
    # Multi-step autonomous loop
    # ------------------------------------------------------------------
    def autonomous_run(
        self,
        goal: str,
        device_id: str | None = None,
        max_steps: int = 5,
    ) -> Dict[str, Any]:
        """Capture screen → analyse → execute → repeat until done or max_steps."""

        steps: List[Dict[str, Any]] = []
        for step_idx in range(max_steps):
            # 1. Capture
            try:
                screenshot_b64 = self._capture_screenshot(device_id)
            except RuntimeError as exc:
                steps.append({"step": step_idx, "ok": False, "error": str(exc)})
                break

            # 2. Analyse + execute
            result = self.analyze_ui_and_execute(screenshot_b64, goal, device_id)
            result["step"] = step_idx
            steps.append(result)

            # 3. Check if goal done
            executed = result.get("executed_action") or {}
            if executed.get("action") == "done":
                break

            # 4. Small pause for UI to settle
            time.sleep(0.8)

        return {"ok": True, "goal": goal, "total_steps": len(steps), "steps": steps}

    # ------------------------------------------------------------------
    # Dispatch a parsed action to the automation layer
    # ------------------------------------------------------------------
    def _dispatch_action(
        self, action_json: Dict[str, Any], device_id: str | None
    ) -> Dict[str, Any]:
        action = (action_json.get("action") or "").lower()

        if action == "done":
            return {
                "ok": True,
                "executed_action": action_json,
                "engine_result": {"action": "done"},
            }

        payload: Dict[str, Any] = {}
        if action == "click":
            payload["coords"] = action_json.get("coords")
        elif action == "type":
            payload["text"] = action_json.get("text", "")
        elif action == "scroll":
            payload["amount"] = action_json.get("amount", -500)

        result = execute_for_device(device_id, action, payload)
        return {"ok": True, "executed_action": action_json, "engine_result": result}
