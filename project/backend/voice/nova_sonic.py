import os
import json
import base64
import asyncio
import struct
import time
from typing import Any, AsyncGenerator, Dict, Optional

import boto3
from dotenv import load_dotenv

load_dotenv()


class NovaVoiceSonic:
    """Real-time voice interaction using Amazon Nova 2 Sonic.

    Supports:
    - One-shot text-to-speech synthesis (file output)
    - Bidirectional speech-to-speech streaming via Bedrock Converse Stream
    """

    SAMPLE_RATE = 16000  # 16kHz PCM for Bedrock
    CHANNELS = 1
    CHUNK_DURATION_MS = 200  # ~200ms per audio frame

    def __init__(self) -> None:
        self.model_id = os.getenv("NOVA_SONIC_MODEL_ID", "amazon.nova-sonic-v2:0")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self._client: Optional[Any] = None

    def _has_explicit_aws_credentials(self) -> bool:
        access_key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        secret_key = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
        if not access_key or not secret_key:
            return False
        if access_key.lower().startswith("your_") or secret_key.lower().startswith("your_"):
            return False
        return True

    @property
    def bedrock_runtime(self):
        if self._client is None:
            if not self._has_explicit_aws_credentials():
                return None
            self._client = boto3.client(
                service_name="bedrock-runtime",
                region_name=self.region,
            )
        return self._client

    # ------------------------------------------------------------------
    # One-shot TTS (existing)
    # ------------------------------------------------------------------
    def synthesize_speech(self, text: str, output_path: str) -> bool:
        """Synthesize text to speech file using Nova 2 Sonic."""
        try:
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                body=json.dumps({"text": text, "voice": "standard"}),
            )
            with open(output_path, "wb") as f:
                f.write(response["body"].read())
            return True
        except Exception as e:
            print(f"Nova Sonic synthesis error: {e}")
            return False

    # ------------------------------------------------------------------
    # Bidirectional streaming: audio in → text + audio out
    # ------------------------------------------------------------------
    async def stream_conversation(
        self,
        audio_chunks: AsyncGenerator[bytes, None],
        *,
        system_prompt: str = "You are OmniAccess, a helpful accessibility assistant. Respond concisely and naturally.",
        voice_id: str = "tiffany",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream audio to Nova Sonic and yield response events.

        Yields dicts with keys:
          - {"type": "transcript_partial", "text": str}
          - {"type": "transcript_final", "text": str}
          - {"type": "audio", "data": str}  (base64 PCM16 @ 16kHz)
          - {"type": "response_text", "text": str}
          - {"type": "done"}
          - {"type": "error", "error": str}
        """
        try:
            # Build the Bedrock Converse stream session
            session_config = {
                "modelId": self.model_id,
                "system": [{"text": system_prompt}],
                "inferenceConfig": {
                    "maxTokens": 1024,
                },
            }

            # Accumulate user audio for the request
            audio_buffer = bytearray()
            async for chunk in audio_chunks:
                audio_buffer.extend(chunk)

            if not audio_buffer:
                yield {"type": "error", "error": "No audio received"}
                return

            # Encode accumulated audio as base64 for the request
            audio_b64 = base64.b64encode(bytes(audio_buffer)).decode("ascii")

            # Send to Bedrock via converse_stream with audio input
            try:
                response = self.bedrock_runtime.converse_stream(
                    modelId=self.model_id,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "audio": {
                                        "format": "pcm",
                                        "source": {"bytes": bytes(audio_buffer)},
                                    }
                                }
                            ],
                        }
                    ],
                    system=[{"text": system_prompt}],
                    inferenceConfig={"maxTokens": 1024},
                )

                stream = response.get("stream")
                if stream:
                    full_text = ""
                    for event in stream:
                        if "contentBlockDelta" in event:
                            delta = event["contentBlockDelta"].get("delta", {})
                            if "text" in delta:
                                text_chunk = delta["text"]
                                full_text += text_chunk
                                yield {
                                    "type": "response_text",
                                    "text": text_chunk,
                                }
                        elif "messageStop" in event:
                            break

                    # Synthesize the full response text to audio
                    if full_text:
                        yield {"type": "transcript_final", "text": full_text}
                        # Generate TTS audio for the response
                        async for audio_event in self._synthesize_stream(full_text):
                            yield audio_event

            except self.bedrock_runtime.exceptions.ClientError:
                raise
            except Exception as stream_err:
                # If Converse stream API isn't available, fall back to invoke
                yield {"type": "error", "error": f"Stream API: {stream_err}"}
                return

            yield {"type": "done"}

        except Exception as exc:
            yield {"type": "error", "error": str(exc)}

    async def _synthesize_stream(
        self, text: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Synthesize text response into audio chunks for streaming back."""
        try:
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                body=json.dumps({"text": text, "voice": "standard"}),
            )
            audio_bytes = response["body"].read()

            # Stream in CHUNK_DURATION_MS-sized frames
            bytes_per_chunk = (
                self.SAMPLE_RATE
                * self.CHANNELS
                * 2  # 16-bit = 2 bytes per sample
                * self.CHUNK_DURATION_MS
                // 1000
            )
            offset = 0
            while offset < len(audio_bytes):
                chunk = audio_bytes[offset : offset + bytes_per_chunk]
                yield {
                    "type": "audio",
                    "data": base64.b64encode(chunk).decode("ascii"),
                }
                offset += bytes_per_chunk
                await asyncio.sleep(0.01)  # yield control

        except Exception as exc:
            # TTS synthesis failed — send text-only response
            yield {"type": "error", "error": f"TTS synthesis: {exc}"}

    # ------------------------------------------------------------------
    # Fallback: heuristic voice response (no AWS credentials)
    # ------------------------------------------------------------------
    def heuristic_respond(self, transcript: str) -> Dict[str, Any]:
        """Generate a response without LLM — keyword-based fallback."""
        text = transcript.lower().strip()

        if not text:
            return {"text": "I didn't catch that. Could you repeat?", "action": None}

        # Simple keyword matching for common accessibility commands
        if any(w in text for w in ("hello", "hi", "hey")):
            return {"text": "Hello! How can I help you today?", "action": None}
        if any(w in text for w in ("thank", "thanks")):
            return {"text": "You're welcome! Anything else?", "action": None}
        if "time" in text:
            from datetime import datetime
            now = datetime.now().strftime("%I:%M %p")
            return {"text": f"The current time is {now}.", "action": None}
        if "date" in text:
            from datetime import datetime
            today = datetime.now().strftime("%B %d, %Y")
            return {"text": f"Today's date is {today}.", "action": None}
        if any(w in text for w in ("weather", "temperature")):
            return {"text": "I don't have live weather data, but you can ask me to search the web.", "action": "web_search"}
        if any(w in text for w in ("open", "launch")):
            app = text.replace("open", "").replace("launch", "").strip()
            return {"text": f"Opening {app or 'the app'}.", "action": "open_app", "args": {"app_name": app}}
        if any(w in text for w in ("search", "look up", "find")):
            query = text.replace("search", "").replace("look up", "").replace("find", "").strip()
            return {"text": f"Searching for {query or 'that'}.", "action": "web_search", "args": {"query": query}}
        if any(w in text for w in ("volume up", "louder")):
            return {"text": "Turning volume up.", "action": "adjust_volume", "args": {"direction": "up"}}
        if any(w in text for w in ("volume down", "quieter")):
            return {"text": "Turning volume down.", "action": "adjust_volume", "args": {"direction": "down"}}
        if "screenshot" in text:
            return {"text": "Taking a screenshot now.", "action": "take_screenshot"}
        if any(w in text for w in ("note", "remember")):
            content = text.replace("note", "").replace("remember", "").strip()
            return {"text": f"Noted: {content or text}.", "action": "add_note", "args": {"content": content or text}}

        return {
            "text": f"I heard: \"{transcript}\". I'll process that for you.",
            "action": "task_execute",
            "args": {"text": transcript},
        }
