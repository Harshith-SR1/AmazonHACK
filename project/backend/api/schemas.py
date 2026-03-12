from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CommandRequest(BaseModel):
    text: str = Field(..., description="User command text")
    device_id: Optional[str] = Field(default=None)
    modality: str = Field(default="text")


class CommandResponse(BaseModel):
    response_text: str
    tool_invocations: List[Dict[str, Any]] = Field(default_factory=list)
    execution_results: List[Dict[str, Any]] = Field(default_factory=list)


class GestureEventRequest(BaseModel):
    gesture_name: str
    source_device: str
    target_device: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TrainGestureRequest(BaseModel):
    name: str
    landmarks: List[List[float]]
    mapped_task: str


class SignTrainRequest(BaseModel):
    label: str
    landmarks: List[List[float]]


class SignPredictRequest(BaseModel):
    landmarks: List[List[float]]


class SignEventRequest(BaseModel):
    landmarks: List[List[float]]
    source_device: str = "desktop-1"
    target_device: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DeviceInfo(BaseModel):
    id: str
    name: str
    type: str
    online: bool


class AvatarSettings(BaseModel):
    avatar_id: str
    voice_name: str = "Nova-Sonic-Default"
    theme: str = "default"
    expression: str = "friendly"
    avatar_name: str = "Nova"
    speech_speed: float = 1.0
    animations_enabled: bool = True


class AWSCredentialsPayload(BaseModel):
    aws_access_key_id: str = Field(default="", description="AWS access key ID")
    aws_secret_access_key: str = Field(default="", description="AWS secret access key")
    aws_session_token: str = Field(default="", description="Optional session token for temporary credentials")
    aws_region: str = Field(default="us-east-1", description="AWS region")


class DevicePairRequest(BaseModel):
    method: str = Field(..., description="wifi or bluetooth")
    pairing_code: str = Field(..., description="Pairing code for device linking")


class DevicePairDiscoveredRequest(BaseModel):
    method: str = Field(..., description="wifi or bluetooth")
    address: str = Field(..., description="IP address or BLE MAC address")
    name: str = Field(default="", description="Discovered device name")
    device_type: str = Field(default="unknown", description="Device type hint")


class TransferLinkRequest(BaseModel):
    source_device: str
    target_device: str
    url: str
    title: Optional[str] = None


class LiveStreamRequest(BaseModel):
    prompt: str
    image_base64: Optional[str] = None


class GenerationRequest(BaseModel):
    prompt: str


class GenerationImageResponse(BaseModel):
    ok: bool
    images: List[Dict[str, Any]] = Field(default_factory=list)
    message: Optional[str] = None
    error: Optional[str] = None


class GenerationVideoResponse(BaseModel):
    ok: bool
    videos: List[Dict[str, Any]] = Field(default_factory=list)
    operation: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
