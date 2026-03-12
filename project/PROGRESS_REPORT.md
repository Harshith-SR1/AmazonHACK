# OmniAccess — Progress Report & Todo List

> Last Updated: March 12, 2026

---

## Session Progress — Completed Features

### Phase 1: Integration Audit & Core Fixes
- [x] **AvatarSettings schema fix** — Fixed missing/mismatched fields in Pydantic model
- [x] **Device pairing endpoint** — Fixed `/api/devices/pair` to properly add to registry
- [x] **Avatar settings persistence** — Fixed `save_avatar_settings` backend endpoint
- [x] **Camera CSS fix** — Fixed `.video` class display so user camera renders correctly

### Phase 2: UI Reorganization
- [x] **Voice Language → Settings** — Created shared `languages.js` (150+ BCP-47 codes), lifted `voiceLang` state to App.jsx, moved selector to Settings General tab
- [x] **AI Engine → Settings** — Moved AI Engine badge from Dashboard to Settings General tab
- [x] **Mic/Camera → Camera Overlay** — Mic and camera controls now appear as overlay buttons on the user camera pane
- [x] **Removed gesture shortcut buttons** — Removed 4 redundant gesture buttons from main UI

### Phase 3: Desktop Automation Rewrite
- [x] **Quick Actions now work** — Rewrote `desktop_automation.py` with `webbrowser.open()` for 30+ apps, YouTube search, direct URL opening
- [x] **Removed dead Quick Actions** — Removed "Scroll Down" and "Play Music" (no browser-based equivalent)
- [x] **Meaningful response text** — Backend returns descriptive responses (e.g., "Opened YouTube for you" instead of generic "Done")
- [x] **Add Note opens Notepad** — `add_note` tool writes to temp file and opens `notepad.exe`
- [x] **Screenshot displays inline** — Base64 screenshot image renders in the AI response area
- [x] **Unknown app error handling** — Apps not in the known list return an error instead of guessing URLs

### Phase 4: Command Bar & Voice
- [x] **Persistent Command Bar** — Always-visible bar with mic button + text input field
- [x] **Live Transcript Panel** — Shows "Listening…", interim text, final text, and mic errors
- [x] **Removed Send button** — Enter key now submits; cleaner UI
- [x] **Voice recognition fixed** — Switched from `continuous:true` to non-continuous with auto-restart via `gotFinalRef` for reliable detection
- [x] **Stable `onSendCommandRef`** — Prevents stale closure bugs in MediaPipe/voice callbacks

### Phase 5: Finger Sign Actions
- [x] **Index finger → Open YouTube** (only index extended)
- [x] **Middle finger → Open WhatsApp** (only middle extended)
- [x] **3 fingers → Open New Tab** (index + middle + ring, pinky down)
- [x] **Pinky finger → Device Transfer Panel** (only pinky extended) ← NEW
- [x] **Left-hand detection fixed** — Uses Y-axis only (no X-axis thumb check)
- [x] **Busy lock + cooldown** — `fingerSignBusyRef` (5s) + cooldown (4s) prevent rapid firing
- [x] **Loop prevention** — Same gesture won't fire again until different gesture shown or hand leaves camera ← FIXED

### Phase 6: Device-to-Device File Transfer
- [x] **Backend Transfer API** — 6 new endpoints:
  | Endpoint | Purpose |
  |---|---|
  | `POST /api/transfer/upload` | Upload files (multipart form, 100MB max) |
  | `POST /api/transfer/link` | Send a URL/link to another device |
  | `GET /api/transfer/pending/{device_id}` | Check pending transfers for a device |
  | `GET /api/transfer/download/{transfer_id}` | Download a transferred file |
  | `POST /api/transfer/accept/{transfer_id}` | Mark transfer as accepted |
  | `GET /api/transfer/history` | View recent transfer history |
- [x] **Transfer Panel UI** — Full-featured modal overlay:
  - Device selector showing all online/paired devices
  - File picker with drag & drop support (multiple files, images, folders)
  - Link/URL input field
  - Send button with status feedback
  - Transfer history with status badges (pending/accepted/downloaded)
- [x] **Pinky gesture activation** — Show pinky finger to camera to open transfer panel
- [x] **Gesture loop fix** — `lastFingerSignRef` requires different gesture or hand absence before same sign can re-trigger

---

## Architecture Overview

```
Frontend (React 18.3 + Vite 5.4)     Backend (FastAPI + Uvicorn)
─────────────────────────────────     ──────────────────────────────
MainInteractionScreen.jsx             main.py (API endpoints)
├── VideoCallPanel.jsx (camera)       ├── agent/ (Nova agent + routing)
├── MorseCodeInput.jsx                ├── automation/ (desktop + mobile)
├── Gesture classifier (MediaPipe)    ├── tools/ (17 action tools)
├── Voice input (SpeechRecognition)   ├── gesture/ (MediaPipe engine)
├── Command bar + transcript          ├── memory/ (SQLite store)
├── Transfer panel overlay            ├── security/ (audit + guards)
└── Quick actions grid                └── api/ (Pydantic schemas)

Settings: Language, AI Engine, Avatar, Permissions, Device Link, Gesture
Dashboard: Session timer, stats, modality breakdown, history
```

---

## Current Gesture / Sign Mappings

### Finger Sign Shortcuts (auto-fire via camera)
| Gesture | Detection | Action |
|---|---|---|
| ☝️ Index only | Index up, others down | Open YouTube |
| 🖕 Middle only | Middle up, others down | Open WhatsApp |
| 🤟 3 Fingers | Index+middle+ring, pinky down | Open New Tab |
| 🤙 Pinky only | Pinky up, others down | Open Transfer Panel |

### General Gestures (sent to /api/gesture/event)
| Gesture | Detection | Action |
|---|---|---|
| ✊ Fist | All fingers down, thumb down | Capture context |
| 👍 Thumbs Up | All fingers down, thumb up | Confirm |
| ✌️ Two Fingers | Index+middle up only | Cancel / back |
| 🖐️ Open Palm | All 4 fingers up | Release / send |

### ASL Signs (24 pre-trained)
hello, thank_you, please, yes, no, help, stop, sorry, love, friend, eat, drink, more, done, good, bad, home, work, go, come, open, close, up, down

---

## Quick Actions
| Action | Command Sent |
|---|---|
| ▶️ Open YouTube | `open youtube` |
| 🔍 Search YouTube | `search youtube trending videos` |
| 🌐 Open Google | `open google.com` |
| 📸 Take Screenshot | `take screenshot` |
| 📝 Add Note | `add note remember to check this later` |
| 🏠 Go Home | `go home` |

---

## Backend API Endpoints (Full List)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/api/models/nova` | Active models + full model catalog |
| `POST` | `/api/task/execute` | Universal task execution (any modality) |
| `POST` | `/api/command` | Legacy command execution |
| `POST` | `/api/morse/decode` | Server-side Morse → text decoding |
| `POST` | `/api/notes/add` | Add a note |
| `GET` | `/api/notes` | List all notes |
| `GET` | `/api/languages` | 79 supported voice languages |
| `GET` | `/api/usage/stats` | Dashboard usage statistics |
| `POST` | `/api/usage/track` | Track usage events |
| `GET` | `/api/devices` | List registered devices |
| `POST` | `/api/devices/pair` | Pair a device via BT/Wi-Fi |
| `POST` | `/api/transfer/upload` | Upload file to transfer queue |
| `POST` | `/api/transfer/link` | Send link to a device |
| `GET` | `/api/transfer/pending/{device_id}` | Pending transfers for device |
| `GET` | `/api/transfer/download/{transfer_id}` | Download transferred file |
| `POST` | `/api/transfer/accept/{transfer_id}` | Accept a transfer |
| `GET` | `/api/transfer/history` | Transfer history |
| `GET` | `/api/mobile/health` | Mobile device health check |
| `POST` | `/api/gesture/event` | Process gesture events |
| `POST` | `/api/gesture/train` | Train a custom gesture |
| `GET` | `/api/gesture/custom` | List custom gestures |
| `POST` | `/api/sign/event` | Process sign language events |
| `POST` | `/api/sign/train` | Train a sign |
| `POST` | `/api/sign/train/bulk` | Bulk train signs |
| `POST` | `/api/sign/predict` | Predict a sign from landmarks |
| `GET` | `/api/sign/vocabulary` | Full ASL vocabulary |
| `GET` | `/api/sign/stats` | User sign training stats |
| `GET` | `/api/memory/personal` | Personal memory |
| `POST` | `/api/settings/avatar` | Save avatar settings |
| `POST` | `/api/live/stream` | Live SSE streaming |
| `POST` | `/api/generate/image` | Generate image via Nova |
| `POST` | `/api/generate/video` | Generate video via Nova |
| `WebSocket` | `/ws/live` | Live multimodal WebSocket |
| `POST` | `/api/act/analyze` | Nova Act UI analysis |
| `POST` | `/api/voice/synthesize` | Voice synthesis |

---

## Todo — Future Enhancements

### High Priority
- [ ] **AWS credentials setup** — Connect real Amazon Nova Bedrock credentials for full LLM-powered routing
- [ ] **Real Bluetooth/Wi-Fi discovery** — Replace code-based pairing with actual device scanning (Capacitor BLE/WiFi plugins)
- [ ] **Real-time transfer notifications** — WebSocket or SSE push to target device when transfer arrives
- [ ] **Persistent device registry** — Save paired devices to database instead of in-memory list
- [ ] **Transfer folder support** — Allow drag-and-drop of entire folders (zip on upload, unzip on download)

### Medium Priority
- [ ] **Nova Sonic voice streaming** — Enable bidirectional speech-to-speech with Nova Sonic WebSocket
- [ ] **Nova Act browser automation** — Full autonomous web interaction loops
- [ ] **Custom gesture training UI** — In-app recording + training of new gestures from camera
- [ ] **Transfer progress bar** — Show upload/download progress for large files
- [ ] **Transfer receipt on target device** — Target device shows incoming transfer notification

### Low Priority
- [ ] **Dark/light theme toggle** — Currently dark-only; add light mode
- [ ] **Multi-language TTS** — Match TTS voice to selected input language
- [ ] **Offline mode** — Cache commands and queue for when backend is unreachable
- [ ] **Gesture tutorial** — Guided walkthrough showing each gesture to new users
- [ ] **Analytics dashboard** — Track which gestures/modalities are used most

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3, Vite 5.4.21 |
| Styling | Custom CSS (glassmorphism, dark theme) |
| Mobile | Capacitor 6/8 (Android + iOS) |
| Hand Tracking | MediaPipe Hands (21 landmarks) |
| Speech | Web Speech API (SpeechRecognition + SpeechSynthesis) |
| Backend | FastAPI, Python 3.11+, Uvicorn |
| AI Models | Amazon Nova 2 (Lite, Pro, Omni, Sonic, Act) |
| LLM Framework | LangChain (langchain-aws, ChatBedrockConverse) |
| Cloud | AWS (Bedrock, S3, CloudWatch) |
| Automation | pyautogui, webbrowser, subprocess |
| Sign ML | scikit-learn (KNN classifier) |
| File Transfer | In-memory queue + local filesystem |

---

## File Structure

```
project/
├── frontend/
│   ├── src/
│   │   ├── App.jsx                    # Root, lifted state (voiceLang, avatarId)
│   │   ├── styles.css                 # All CSS (~2700 lines)
│   │   ├── languages.js               # 150+ BCP-47 language codes
│   │   ├── apiClient.js               # jsonFetch wrapper
│   │   ├── screens/
│   │   │   ├── MainInteractionScreen.jsx  # Main hub (voice, sign, gesture, morse, transfer)
│   │   │   ├── SettingsScreen.jsx         # All settings tabs
│   │   │   └── AppUsageScreen.jsx         # Dashboard
│   │   └── components/
│   │       ├── VideoCallPanel.jsx     # Camera + avatar
│   │       └── MorseCodeInput.jsx     # Morse input
│   └── capacitor.config.ts           # Mobile config
├── backend/
│   ├── main.py                        # FastAPI app (~800 lines)
│   ├── api/schemas.py                 # Pydantic models
│   ├── agent/
│   │   ├── nova_agent.py              # Amazon Nova LLM agent
│   │   └── tool_router.py            # Heuristic + LLM routing
│   ├── automation/
│   │   └── desktop/desktop_automation.py  # 30+ app URLs, actions
│   ├── tools/
│   │   ├── action_tools.py            # 17 executable tools
│   │   └── context_continuation.py    # Cross-device context
│   ├── gesture/
│   │   ├── mediapipe_engine.py        # Gesture-to-action map
│   │   └── sign_classifier.py         # KNN sign classifier
│   ├── memory/memory_store.py         # SQLite persistence
│   └── security/                      # Audit, guards, CloudWatch
└── FEATURES.md
└── PROGRESS_REPORT.md
```
