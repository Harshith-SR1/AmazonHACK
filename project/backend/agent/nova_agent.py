import os
import json
import base64
import re
from collections import defaultdict, deque
from typing import Any, Deque, Dict, Generator, List, Optional
from dotenv import load_dotenv
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from agent.tool_router import heuristic_tool_plan

load_dotenv()

class AmazonNovaAgent:
    def __init__(self) -> None:
        self.model_id = os.getenv("NOVA_LITE_MODEL_ID", "amazon.nova-lite-v2:0")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self._llm = None
        self._llm_init_attempted = False
        self._history: Dict[str, Deque[tuple[str, str]]] = defaultdict(lambda: deque(maxlen=12))

    def _has_explicit_aws_credentials(self) -> bool:
        access_key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        secret_key = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
        if not access_key or not secret_key:
            return False
        if access_key.lower().startswith("your_") or secret_key.lower().startswith("your_"):
            return False
        return True

    def _get_llm(self):
        if self._llm is not None:
            return self._llm
        if self._llm_init_attempted:
            return None

        self._llm_init_attempted = True
        if not self._has_explicit_aws_credentials():
            return None

        try:
            self._llm = ChatBedrockConverse(
                model_id=self.model_id,
                region_name=self.region,
                max_tokens=2048,
                temperature=0.7,
            )
        except Exception as e:
            print(f"Error initializing Nova agent: {e}")
            self._llm = None
        return self._llm

    def _llm_plan(self, command: str, device_id: str | None) -> List[Dict[str, Any]]:
        llm = self._get_llm()
        if not llm:
            return heuristic_tool_plan(command, device_id)

        prompt = (
            "You are OmniAccess routing planner. Return ONLY JSON list with objects "
            "{name: string, args: object} using tools: open_app, search_youtube, send_message, "
            "transfer_device_context, add_note, get_notes, open_link, open_tab, web_search, "
            "set_reminder, take_screenshot, adjust_volume, play_media, pause_media, scroll_page, "
            "go_home, go_back. If no tool needed, return []. "
            f"User command: {command}. device_id: {device_id}"
        )

        try:
            response = llm.invoke([HumanMessage(content=prompt)])
            text = response.content
            # Cleanup potential markdown formatting
            if isinstance(text, str):
                text = text.strip().replace("```json", "").replace("```", "").strip()
            return json.loads(text) if text else []
        except Exception:
            return heuristic_tool_plan(command, device_id)

    def _looks_like_action_request(self, text: str) -> bool:
        lowered = text.lower()
        action_tokens = (
            "open", "search", "send", "launch", "click", "scroll", "navigate",
            "transfer", "play", "start", "add note", "take note", "save note",
            "remind", "screenshot", "volume", "pause", "stop", "go back",
            "go home", "new tab", "open tab", "open link",
        )
        return any(tok in lowered for tok in action_tokens)

    def _local_chat_response(self, user_text: str) -> str:
        text = user_text.strip()
        lowered = text.lower()

        if not text:
            return "I am here. Tell me what you want to do and I will help."
        if lowered in {"hi", "hii", "hello", "hey", "yo"}:
            return "Hey! I am ready. What do you want to do right now?"
        if "how are you" in lowered:
            return "I am doing well and ready to assist. What are you working on?"
        if "thank" in lowered:
            return "Glad to help. Want to continue with the next step?"
        if self._looks_like_action_request(lowered):
            return "Executing your command now."

        concise = re.sub(r"\s+", " ", text).strip()
        return (
            "Here is a quick response based on your message: "
            f"{concise}. If you want, I can turn this into an actionable task and execute it step by step."
        )

    def _conversation_messages(self, user_id: str, command: str) -> List[Any]:
        messages: List[Any] = [
            SystemMessage(
                content=(
                    "You are OmniAccess, a concise, helpful assistant. "
                    "Respond in a natural conversational style like a modern chat assistant. "
                    "When the user asks for actions, propose clear next steps."
                )
            )
        ]
        for role, content in self._history[user_id]:
            if role == "user":
                messages.append(HumanMessage(content=content))
            else:
                messages.append(AIMessage(content=content))
        messages.append(HumanMessage(content=command))
        return messages

    def run(self, command: str, device_id: str | None = None, user_id: str = "anonymous") -> Dict[str, Any]:
        tool_plan = self._llm_plan(command, device_id)
        llm = self._get_llm()

        response_text: str
        if llm is not None:
            try:
                convo = self._conversation_messages(user_id=user_id, command=command)
                response = llm.invoke(convo)
                raw = response.content if hasattr(response, "content") else ""
                if isinstance(raw, list):
                    response_text = "".join(
                        item.get("text", "") if isinstance(item, dict) else str(item) for item in raw
                    ).strip()
                else:
                    response_text = str(raw).strip()
                if not response_text:
                    response_text = "I am here and ready. Tell me what you want to do next."
            except Exception:
                response_text = self._local_chat_response(command)
        else:
            response_text = self._local_chat_response(command)

        self._history[user_id].append(("user", command))
        self._history[user_id].append(("assistant", response_text))

        return {
            "response_text": response_text,
            "tool_invocations": tool_plan,
        }

    def stream_text(self, prompt: str) -> Generator[str, None, None]:
        llm = self._get_llm()
        if not llm:
            fallback = f"Nova streaming unavailable. Prompt: {prompt}"
            for token in fallback.split(" "):
                yield f"{token} "
            return

        try:
            for chunk in llm.stream([HumanMessage(content=prompt)]):
                if hasattr(chunk, "content") and chunk.content:
                    yield str(chunk.content)
        except Exception as exc:
            yield f"Nova stream error: {exc}"

    def stream_multimodal(self, prompt: str, image_base64: Optional[str] = None) -> Generator[str, None, None]:
        if not image_base64:
            yield from self.stream_text(prompt)
            return

        llm = self._get_llm()
        if not llm:
            yield "Nova multimodal streaming unavailable."
            return

        try:
            # Construct multimodal payload for LangChain/Bedrock
            image_content = {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": image_base64
                }
            }
            message = HumanMessage(content=[{"type": "text", "text": prompt}, image_content])
            
            for chunk in llm.stream([message]):
                if hasattr(chunk, "content") and chunk.content:
                    yield str(chunk.content)
        except Exception as exc:
            yield f"Nova multimodal stream error: {exc}"

    def generate_image(self, prompt: str) -> Dict[str, Any]:
        # Nova Canvas is typically used for image generation
        # This would require a separate client or model_id
        return {"ok": False, "error": "Image generation via Nova Canvas not yet implemented in this snippet."}

    def generate_video(self, prompt: str) -> Dict[str, Any]:
        # Nova Reel is for video generation
        return {"ok": False, "error": "Video generation via Nova Reel not yet implemented."}
