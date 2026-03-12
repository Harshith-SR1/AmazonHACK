# OmniAccess Backend API

## Base URL

- `http://localhost:8000`

## Security Headers (for `/api/*`)

- `x-api-key: dev-key` (or configured key)
- `x-user-id: <user-identifier>`
- optional: `Authorization: Bearer <cognito-id-token>`

## Endpoints

### `GET /health`
Health check.

### `GET /api/devices`
Returns available execution devices.

### `GET /api/mobile/health`
Runs ADB availability/device reliability diagnostics.

### `POST /api/command`
Routes text/voice command through Amazon Nova and tool execution.

Request:
```json
{
  "text": "open youtube and search lo-fi music",
  "device_id": "desktop-1",
  "modality": "voice"
}
```

### `POST /api/gesture/event`
Processes built-in gestures and handles context transfer.

Request:
```json
{
  "gesture_name": "fist",
  "source_device": "desktop-1",
  "target_device": "phone-1",
  "metadata": {"context_id": "yt-1"}
}
```

### `POST /api/gesture/train`
Stores custom gesture landmarks and mapped task.

### `POST /api/sign/train`
Trains sign-language classifier for current user.

### `POST /api/sign/predict`
Predicts sign label from current landmarks for current user.

### `GET /api/gesture/custom`
Returns trained gestures.

### `POST /api/research/upload`
Uploads a document and indexes PDF chunks into ChromaDB.

### `POST /api/research/query`
Queries the knowledge space for summary/answer.

### `POST /api/live/stream`
Server-sent event stream for Amazon Nova live text/multimodal chunks.

### `WS /ws/live`
WebSocket streaming session. Send JSON: `{ "prompt": "...", "image_base64": "...optional..." }`.

### `GET /api/memory/personal`
Returns user preference memory.

### `POST /api/settings/avatar`
Stores avatar and voice preferences.
