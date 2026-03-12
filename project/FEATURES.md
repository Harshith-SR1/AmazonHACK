# OmniAccess — Feature List

> Multi-modal AI-powered accessibility and task automation platform  
> Built with Amazon Nova LLM models · React · FastAPI · Capacitor  
> Last Updated: March 12, 2026

---

## 1. Multi-Modal Input System

### 1.1 Voice Input (All World Languages)
- Speech-to-text via Web Speech API (`SpeechRecognition`)
- **150+ language variants** supported with BCP-47 codes, including:
  - Afrikaans, Amharic, Arabic (10 regional variants), Armenian, Azerbaijani, Basque, Belarusian, Bengali, Bosnian, Bulgarian, Burmese, Catalan, Chinese (Simplified / Traditional / Cantonese), Croatian, Czech, Danish, Dutch, English (US / UK / Australia / India / South Africa / New Zealand / Ireland / Philippines / Singapore), Estonian, Filipino, Finnish, French (France / Canada / Belgium / Switzerland), Georgian, German (Germany / Austria / Switzerland), Greek, Gujarati, Haitian Creole, Hausa, Hawaiian, Hebrew, Hindi, Hmong, Hungarian, Icelandic, Igbo, Indonesian, Irish, Italian, Japanese, Javanese, Kannada, Kazakh, Khmer, Korean, Kurdish, Kyrgyz, Lao, Latvian, Lithuanian, Luxembourgish, Macedonian, Malagasy, Malay, Malayalam, Maltese, Maori, Marathi, Mongolian, Nepali, Norwegian, Chichewa, Odia, Pashto, Persian (Iran / Afghanistan), Polish, Portuguese (Brazil / Portugal), Punjabi (India / Pakistan), Romanian, Russian, Samoan, Serbian, Sesotho, Shona, Sindhi, Sinhala, Slovak, Slovenian, Somali, Spanish (Spain / Mexico / Argentina / Colombia / Chile / Peru / Venezuela / US), Sundanese, Swahili (Kenya / Tanzania), Swedish, Tajik, Tamil (India / Sri Lanka / Malaysia / Singapore), Tatar, Telugu, Thai, Tigrinya, Turkish, Turkmen, Ukrainian, Urdu (Pakistan / India), Uyghur, Uzbek, Vietnamese, Welsh, Xhosa, Yiddish, Yoruba, Zulu
- Language selector dropdown in the Voice panel
- Real-time interim results displayed while speaking
- Final transcript auto-sent as a command to the AI agent

### 1.2 Sign Language & Gesture (Merged)
- Camera-powered hand tracking via **MediaPipe Hands**
- Supports **24 ASL (American Sign Language) signs** out of the box
- **4 built-in gesture types** detected simultaneously:
  - **Fist** — Capture context
  - **Open Palm** — Release / send
  - **Thumbs Up** — Confirm action
  - **Two Fingers (Peace)** — Cancel / go back
- **4 finger-sign shortcuts** (instant actions via camera):
  - **☝️ Index only** — Open YouTube
  - **🖕 Middle only** — Open WhatsApp
  - **🤟 3 Fingers (index+middle+ring)** — Open New Tab
  - **🤙 Pinky only** — Open Device Transfer Panel
- Single unified "Sign & Gesture" tab (no separate gesture tab)
- Real-time landmark extraction (21 hand keypoints per frame)
- Y-axis finger detection (works for both left and right hands)
- Detected signs sent to `/api/sign/event` for prediction and action mapping
- **Triple-layer loop prevention**: cooldown (4s) + busy lock (5s) + same-gesture lock (requires different gesture or hand-leave)
- 6 quick-action cards (Open YouTube, Search YouTube, Open Google, Screenshot, Add Note, Go Home)
- Live indicator showing camera and detection status
- Expandable via Settings → custom sign training

### 1.3 Morse Code Input
- Full **International Morse Code** support (A–Z, 0–9, punctuation)
- Timing-based input system:
  - Short tap (< 200ms) = **dot (.)**
  - Long press (≥ 200ms) = **dash (-)**
  - Character gap (600ms) auto-finalizes a letter
  - Word gap (1400ms) auto-inserts a space
- Interactive key button with press animation
- **Keyboard support**: Spacebar as tap key
- **Touch support**: touchstart / touchend for mobile devices
- Live morse signal + decoded text display
- Expandable reference grid with full Morse alphabet
- Send / Clear controls

---

## 2. AI Agent & Task Execution Engine

### 2.1 Amazon Nova LLM Models
| Model | ID | Description |
|---|---|---|
| Nova 2 Lite | `amazon.nova-lite-v2:0` | Fast reasoning, 1M context window, code interpreter, web grounding, MCP tools |
| Nova 2 Pro | `amazon.nova-pro-v2:0` | Higher capability model (Preview) |
| Nova 2 Omni | `amazon.nova-omni-v2:0` | Unified multimodal: text/image/video/speech (Preview) |
| Nova 2 Sonic | `amazon.nova-sonic-v2:0` | Speech-to-speech bidirectional streaming |
| Nova Multimodal Embedding | `amazon.nova-multimodal-embedding-v1:0` | Cross-modal embeddings |
| Nova Act | `amazon.nova-act-v1:0` | Browser UI automation (GA) |

### 2.2 Tool Execution (17 Tools)
| Tool | Description |
|---|---|
| `open_app` | Open an app on a selected device (50+ known apps) |
| `search_youtube` | Search YouTube by query |
| `send_message` | Send a message to a contact |
| `transfer_device_context` | Transfer captured context between devices |
| `add_note` | Add a note with title and content |
| `get_notes` | Retrieve all saved notes |
| `open_link` | Open a URL in the browser |
| `open_tab` | Open a URL in a new browser tab |
| `web_search` | Search the web (Google) for a query |
| `set_reminder` | Set a reminder for later |
| `take_screenshot` | Take a screenshot of the screen |
| `adjust_volume` | Adjust volume up or down |
| `play_media` | Play current media |
| `pause_media` | Pause current media |
| `scroll_page` | Scroll the page up or down |
| `go_home` | Go to home screen |
| `go_back` | Go back to previous screen |

### 2.3 Intelligent Routing
- **Heuristic tool planner** for instant command routing without LLM roundtrip
- **LLM-based planner** (Amazon Nova Lite) for complex or ambiguous commands
- Automatic fallback: LLM → heuristic if credentials unavailable
- URL extraction via regex for link/tab commands
- 50+ known app names for smart app detection
- Keyword-based routing for notes, reminders, media, navigation, screenshots

### 2.4 Conversation & Memory
- Per-user conversation history (12 messages rolling window)
- Context-aware responses using LangChain message history
- Local fallback responses when Nova API is unreachable
- Personal memory store for user preferences

---

## 3. Modernized Dashboard

### 3.1 Session Tracking
- **Circular progress ring** showing session time vs. 2-hour daily goal
- Live timer with real-time elapsed time (updated every second)
- Session start time displayed
- Pulsing live indicator

### 3.2 Stats Overview
- 3 stat cards:
  - **Actions** — Total commands executed
  - **Modalities** — Number of distinct input modes used
  - **Sessions** — Total session count
- Glass-card design with backdrop blur

### 3.3 Input Modality Breakdown
- Color-coded horizontal bars per modality (Voice, Gesture, Sign Language, Morse Code, Device Automation)
- Emoji icons for each modality
- Count-based metrics with auto-scaling bars
- Auto-polling every 10 seconds

### 3.4 Session History
- Recent sessions list (up to 8 shown)
- Date, duration, start/end times per session
- Auto-saved to localStorage (up to 30 sessions)

### 3.5 AI Engine Badge
- Amazon Nova 2 branding badge
- Lists active model suite (Lite · Sonic · Omni · Act)

---

## 4. Avatar & Video Interface

### 4.1 AI Avatar Display
- Interactive avatar powered by external avatar service
- Speech-synchronized animation (lip sync tick)
- Gesture state relayed to avatar (idle, fist, open_palm, thumbs_up, two_fingers)

### 4.2 User Camera
- Live user camera feed for gesture and sign detection
- Toggle camera on/off
- **Mirrored view** (`scaleX(-1)`) for natural interaction
- **Object-fit cover** for full-pane rendering
- **Brightness and contrast sliders** (CSS filters, default 1.3/1.2)
- Video element shared between gesture/sign detection engines

### 4.3 Live Transcript
- Voice transcript always visible across all input modes
- Shows interim text ("Hearing: ...") in real-time while listening
- Shows final text ("You said: ...") after recognition completes
- Disappears automatically when idle

### 4.4 Controls
- Mic button (quick voice input)
- Camera toggle
- Manual gesture buttons (Fist, Palm, Thumbs Up, Peace)

---

## 5. Avatar Customization

### 5.1 Avatar Identity
- Editable avatar name (e.g. Nova, Aria, Jarvis)
- Expression style presets: Friendly, Professional, Energetic, Calm

### 5.2 Color Themes
- 5 preset color themes: Classic Blue, Emerald, Sunset Orange, Lavender, Neon Green
- Each theme defines shell, accent, and core colors
- Visual swatch previews in Settings

### 5.3 Voice & Animation
- Configurable voice profile name
- Speech speed options: Slow (0.75x), Normal (1.0x), Fast (1.25x), Very Fast (1.5x)
- Animation enable/disable toggle

### 5.4 Avatar Selection
- Two avatar models (Standard and Alternate)
- Settings persisted to backend per user

---

## 6. Text-to-Speech (TTS)

- Browser-native `SpeechSynthesis` API
- AI responses automatically spoken aloud
- **Multi-language TTS**: `utterance.lang` synced to user's selected voice language
- Supports 50+ language codes — TTS output matches the recognition language
- Word boundary tracking for avatar lip sync
- Cancel/restart on new responses

---

## 7. Sign Language & Custom Gesture Training System

### 7.1 Sign Language Training
- Train custom signs with hand landmark data
- Bulk training endpoint (multiple samples at once)
- Per-user sign vocabulary and stats
- 24 pre-mapped ASL signs with action bindings:
  - hello, thank_you, please, yes, no, help, stop, sorry, love, friend, eat, drink, more, done, good, bad, home, work, go, come, open, close, up, down
- Custom gesture-to-task mapping via training

### 7.2 Custom Gesture Training UI (Rebuilt)
- **3-tab interface**: Custom Gestures | Sign Language | Saved Gestures
- **Camera section** with click-to-start overlay, live video preview, and hand detection indicator
- **3-second countdown recording**: animated countdown overlay → auto-records for 3 seconds → auto-stops
- Frame capture up to 60 frames (21 hand landmarks per frame)
- Red pulsing "● REC" badge with live frame count
- Representative frame selection (middle frame) for training
- **Custom Gestures tab**:
  - Name + mapped task/command inputs
  - Record Pose (3s) and Save Gesture buttons
  - Frames-captured badge with ✓ indicator
- **Sign Language tab**:
  - Vocabulary dropdown selector with action mappings
  - Train, Predict, and Execute Sign → Agent buttons
  - Live prediction result display with confidence %
  - Training stats cards: Samples | Signs Trained | Untrained
  - Expandable vocabulary grid (24 ASL signs)
- **Saved Gestures tab**:
  - Lists all custom gestures with name and mapped task
  - Per-gesture delete button (calls `DELETE /api/gesture/custom/{name}`)
  - Real-time status messages for save/delete
- Styled with 50+ `.gt-*` CSS classes (glass-morphism, teal accent, animations)

### 7.3 Interactive Gesture Tutorial
- **8-step guided walkthrough** covering all gestures:
  1. ✊ Fist — Capture Context
  2. 🖐️ Open Palm — Release / Send
  3. 👍 Thumbs Up — Confirm
  4. ✌️ Two Fingers — Cancel / Back
  5. ☝️ Index Finger — Open YouTube
  6. 🖕 Middle Finger — Open WhatsApp
  7. 🤟 Three Fingers — Open New Tab
  8. 🤙 Pinky — Device Transfer
- Previous / Next step navigation with step indicator ("3 / 8")
- Animated progress bar
- "Try it now" button to test each gesture live during the tutorial
- Emoji-based visual learning with instructions and tips
- Launchable from the Sign & Gesture panel

---

## 8. Device Automation & Linking

### 8.1 Multi-Device Support
- **Persistent device registry** — paired devices stored in SQLite (`devices` table in `omniaccess.db`), surviving server restarts
  - Schema: `id`, `name`, `type`, `online`, `last_seen`, `paired_at` columns
  - Default devices (`desktop-1`, `phone-1`) seeded automatically on first startup
  - CRUD operations: upsert, remove, toggle online status
- Context capture and transfer between devices
- Device-targeted command execution
- **Heartbeat endpoint** — devices ping `POST /api/devices/{id}/heartbeat` to stay marked online with updated `last_seen` timestamp
- **Online/offline toggle** — `POST /api/devices/{id}/online` to explicitly set device status
- **Device removal** — `DELETE /api/devices/{id}` removes a device from the persistent registry

### 8.2 Device Linking & Discovery (Bluetooth / Wi-Fi)
- **Real-time device scanning** — discover devices on your network or nearby via Bluetooth
  - Wi-Fi scanning: parses local ARP table (`arp -a`), resolves hostnames, guesses device types
  - Bluetooth scanning: uses `bleak` BLE library on backend (graceful fallback if not installed)
  - Web Bluetooth API: browser-native BLE device picker via `navigator.bluetooth.requestDevice()`
  - Scan results show device name, address, MAC, RSSI (BLE), type icon, and connection method
- **One-click pairing** from scan results — discovered devices paired via `POST /api/devices/pair-discovered`
- **Manual code-based pairing** preserved as fallback (collapsible `<details>` section)
- Paired devices listed with online/offline status, type icon, and connection method
- **Remove synced to backend** — `DELETE /api/devices/{id}` called on removal
- **Devices loaded from backend on mount** — `GET /api/devices` ensures persistence across page refresh
- Demo mode fallback when backend is unreachable
- API endpoints:
  - `POST /api/devices/scan/wifi` — scan local network via ARP
  - `POST /api/devices/scan/bluetooth` — scan BLE devices via bleak
  - `POST /api/devices/pair-discovered` — pair a device found via scanning

### 8.3 Device-to-Device File Transfer (Sign Language Triggered)
- **Pinky finger gesture** opens the Transfer Panel instantly from camera
- Full modal overlay with:
  - Target device selector (shows all paired/online devices with type icons)
  - File picker with **drag-and-drop** support (multiple files, images, folders, up to 100MB each)
  - **Folder drag-and-drop**: drop entire folders from your file manager — they're automatically detected, recursively scanned, zipped server-side, and transferred as a single `.zip`
  - **Link/URL input** for sharing web pages between devices
  - Send button with real-time status feedback
  - **Transfer history** with status tracking (pending → accepted → downloaded)
- **Real-time upload progress bar**:
  - XHR-based upload replacing `fetch()` for `xhr.upload.onprogress` tracking
  - Live percentage display with animated fill bar
  - Current filename shown during upload
  - Multi-file counter ("File 2 of 5")
  - Color-coded status badges (pending/accepted/downloaded)
- Backend transfer queue (in-memory) with file storage on disk
- 7 API endpoints: upload, upload-folder, link, pending, download, accept, history
- Clickable from Finger Sign Shortcuts card (no camera needed)
- **Real-time transfer notifications** (SSE push):
  - `GET /api/transfer/notifications/{device_id}` — Server-Sent Events stream
  - Pushes instant notification when a file or link transfer targets the subscribed device
  - 30-second keepalive heartbeats to prevent connection timeout
  - Per-device subscriber queues with async cleanup on disconnect
  - Frontend `EventSource` auto-connects on mount, auto-reconnects on failure
  - **Toast notification UI**: slide-in animated toasts (top-right) showing transfer type icon, filename/title, sender device
  - Auto-dismiss after 6 seconds, manual dismiss with ✕ button
  - "Open" button on toast opens the transfer panel and refreshes history
  - Auto-refreshes transfer history when panel is already open
  - Max 5 simultaneous toasts displayed
- **Folder transfer support**:
  - Drag-and-drop entire folders from the OS file manager
  - Browser `webkitGetAsEntry()` API detects directories and recursively reads all nested files
  - Folder contents are uploaded as multipart form with relative paths preserved
  - Backend zips all files into a single `.zip` archive (`zipfile.ZIP_DEFLATED`)
  - Path traversal protection: `..` path segments are stripped
  - Transfer record type `"folder"` with `folder_name` and `file_count` metadata
  - Folder items displayed with 📁 icon, file count badge, and teal accent border
  - Download returns the `.zip` file with `application/zip` content type
  - Mixed support: drop files and folders together in a single drag-drop operation
- **Transfer receipt on target device** (Send / Receive tabs):
  - Transfer panel now has **Send** and **Receive** tab toggle
  - **Receive tab**: full incoming transfers inbox listing all transfers targeting this device
  - Each incoming transfer shows: type icon, filename/folder/link, sender device, file size, timestamp
  - **Accept / Decline / Download** action buttons per transfer
  - Status badges: pending (teal), accepted (green), downloaded (grey)
  - Pending transfers highlighted with teal left-border accent
  - Badge counter on "Receive" tab shows number of pending incoming transfers
  - **Bi-directional SSE notifications**: when target accepts/declines/downloads, the sender receives a receipt toast
  - Receipt toasts show: ✅ Accepted, ⬇️ Downloaded, or ❌ Declined with device name
  - `POST /api/transfer/decline/{transfer_id}` — decline endpoint sets status and notifies sender
  - `GET /api/transfer/incoming/{device_id}` — returns all non-declined transfers for the device
  - Empty state with 📭 icon and helpful message when no incoming transfers
  - Auto-refreshes incoming list when SSE notification arrives

### 8.4 Automation Actions
- Open apps, links, tabs
- Media playback control (play/pause)
- Volume adjustment
- Page scrolling
- Navigation (home/back)
- Screenshots

### 8.5 Nova Act Browser Automation
- **Full autonomous web interaction loops** powered by Amazon Nova Act (GA)
- **Frontend UI** — dedicated "Browser AI" tab in Settings with:
  - Natural language **task goal** input (textarea) — describe what the browser should do
  - **Example task chips** — one-click preset goals (Google search, YouTube, Wikipedia, Amazon, GitHub)
  - **Target device selector** — choose desktop or any paired device
  - **Mode toggle** — Single Step (one action) or Autonomous (multi-step loop)
  - **Max steps slider** (2–10) for autonomous mode — safety cap at 10
  - **Run / Stop buttons** with animated running indicator
  - **Live step-by-step progress** — scrollable panel showing each action: click 🖱️, type ⌨️, scroll 📜, wait ⏳, done ✅
    - Each step shows: action type, target element, typed text, AI reasoning
    - Color-coded: latest (teal), done (green), failed (red)
  - **Result summary** — success/failure banner with mode, step count, goal status
  - **Task history** — clickable log of past tasks (re-run by clicking), max 20 entries
- **Backend engine** (`automation/nova_act_engine.py`):
  - Screenshot capture via pyautogui (desktop) / adb (mobile)
  - Screenshot sent to Nova Act LLM for visual reasoning
  - Parsed JSON action response: click, type, scroll, wait, done
  - Action dispatch to `execute_for_device()` automation layer
  - Autonomous loop: capture → analyze → execute → pause → repeat until done or max_steps
- **API**: `POST /api/act/analyze` (goal, autonomous, max_steps, device_id, screenshot_base64)
- Light/dark theme support for all automation UI

### 8.6 Nova Sonic Voice Streaming
- **Bidirectional speech-to-speech** via WebSocket (`/ws/voice/sonic`)
- **Frontend UI** — `VoiceStreamingPanel` component accessible as "Voice Stream 🎙️" input mode:
  - **WebSocket connection management** — Connect / Disconnect with status indicator (idle / connecting / ready / recording / processing / speaking / error)
  - **Push-to-talk recording** — hold the record button (mouse + touch support) to capture audio
  - **Audio capture pipeline**: `getUserMedia` → AudioContext 16 kHz → ScriptProcessor → Float32 → Int16 PCM → base64 → WebSocket
  - **Audio playback pipeline**: base64 → Int16 PCM → Float32 → AudioBuffer → BufferSource (queued chunk playback)
  - **Text input alternative** — type a message instead of speaking; sent as `{"type":"text"}`
  - **Live transcript area** — real-time user transcript (partial + final) and AI response with typing indicator
  - **Conversation history** — scrollable message log (user + assistant)
  - **Latency display** — round-trip latency badge
  - **Language badge** — shows current voice language
- **Backend engine** (`voice/nova_sonic.py`):
  - `NovaVoiceSonic` class: `stream_conversation()` async generator — collects PCM audio → Bedrock `converse_stream()` → yields transcript / response / audio events
  - `_synthesize_stream()` — TTS model streaming, chunks audio into 200 ms frames as base64
  - `heuristic_respond(transcript)` — keyword-based offline fallback (greetings, time, date, open app, search, volume, screenshot, notes)
  - Audio format: PCM16 @ 16 kHz mono, 200 ms chunk duration
- **WebSocket protocol**:
  - Client → Server: `config` (voice_id, language) → `audio` chunks → `end` | `text`
  - Server → Client: `config_ack` → `transcript_partial` / `transcript_final` → `response_text` → `audio` chunks → `action` → `done`
- Light/dark theme support for all voice streaming UI

### 8.7 AWS Credentials Management
- **Live credential configuration** — connect real Amazon Bedrock without restarting the server
- **Settings UI** — dedicated "AWS" tab in Settings with:
  - **Status banner** — shows Connected (green) or Not Configured (amber) with masked key and region
  - **Engine status grid** — real-time cards showing Nova Agent, Nova Sonic, Nova Act, S3 Storage online/offline
  - **Credential form** — Access Key ID, Secret Access Key (with show/hide toggle), optional Session Token, Region selector (14 AWS regions)
  - **Test Connection** — validates credentials against Bedrock `list_foundation_models()` without saving, with specific error messages (invalid key, expired token, permission denied)
  - **Save & Connect** — persists to backend `.env`, sets `os.environ`, and hot-reinitializes all engine clients
  - **Disconnect** — clears credentials and reverts to heuristic/offline fallback mode
- **Backend API**:
  - `GET /api/settings/aws/status` — credential status + engine health (no secrets exposed)
  - `POST /api/settings/aws` — save credentials, update `.env`, reinit all engines
  - `POST /api/settings/aws/test` — dry-run credential validation against Bedrock
  - `POST /api/settings/aws/clear` — clear credentials, revert to heuristic mode
- **Credential validation**: rejects empty, placeholder (`your_*`), and invalid credentials
- **Engine hot-reload**: all 4 engine clients (NovaAgent, S3, NovaSonic, NovaAct) reset and reinitialize with new credentials
- Light/dark theme support for all AWS UI

---

## 9. Dark / Light Theme

- **Toggle button** in app header (☀️ light / 🌙 dark)
- Persisted in `localStorage` (`omniaccess_theme`)
- Full CSS variable system with `[data-theme="light"]` selector
- Light theme palette:
  - Background: `#f5f7fa` / `#ffffff`
  - Text: `#1a202c` / `#4a5568`
  - Accent: `#3b6de0`
  - All cards, borders, glass-morphism, and interactive elements have light equivalents
- Smooth transitions: `transition: background 0.3s, color 0.3s`
- Default: dark theme (OLED-friendly)

---

## 10. Offline Mode

- **Offline detection** via `navigator.onLine` API
- **Smart response caching**:
  - Caches successful GET responses with timestamps in `localStorage`
  - Max 50 cached entries (LRU eviction by age)
  - Cache hit served as fallback when offline
- **Request queue system** (`omniaccess_offline_queue`):
  - Queues non-GET requests (POST/PUT/DELETE) when offline
  - Auto-flushed when connection restored (`window.addEventListener('online')`)
  - Best-effort retry (silently fails on re-send failure)
- Exports: `isOnline()`, `flushOfflineQueue()`, `getOfflineQueue()`

---

## 11. Analytics & Usage Dashboard

### 11.1 Modality Tracking
- Real-time `trackModality()` function posts to `/api/usage/track`
- Tracks every input: voice, text, gesture, sign, morse
- Feature map with icons: 🎤 Voice, 👋 Gesture, 🤟 Sign, 📡 Morse, 📱 Device

### 11.2 Usage Sidebar
- **Circular progress ring**: SVG-based, shows session time vs. 2-hour daily goal
- **Live session card**: elapsed time with pulsing indicator (updated every second)
- **Feature usage bars**: color-coded horizontal bars per modality with counts
- **Session history**: recent sessions list (up to 8 shown) with date, duration, start/end
- Sessions auto-saved to `localStorage` (up to 30)
- Auto-polling stats every 10 seconds

### 11.3 Activity / Task Log
- Displays last 10 task entries (max 50 stored)
- Each entry: timestamp, badge (input/result/error), modality/type, description
- Color-coded: blue (input), teal (result), red (error)
- Clear button to reset log
- Auto-populated from command execution, gesture events, sign detection

---

## 12. Permission Center

- Camera permission: toggleable, reflects actual browser grant state
- Microphone permission: toggleable, reflects actual browser grant state  
- Automation Bridge: shows status based on platform capabilities
- Blocked permissions show "Blocked" label with hint to change in browser site settings
- Refresh button to re-query actual permission states
- Disabled toggle when permission is denied (must be unblocked in browser)

---

## 13. Mobile & Responsive Design

### 13.1 Capacitor (Native Mobile)
- Android and iOS support via `@capacitor/android` and `@capacitor/ios`
- SplashScreen plugin (dark background)
- Keyboard plugin (resize body mode)
- StatusBar plugin (dark overlay)
- Android: mixed content allowed, WebContents debugging enabled
- iOS: content inset automatic

### 13.2 Responsive CSS
- 3 breakpoints: desktop, tablet (768px), phone (480px)
- Collapse sidebar to scrollable panel on mobile
- Stacked voice controls on small screens
- Enlarged Morse key for touch on phones (120px height)
- Hidden mode labels on 480px — icon-only tabs
- Safe area inset support for notched devices

---

## 14. Backend API Endpoints

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
| `GET` | `/api/devices` | List registered devices (from SQLite) |
| `POST` | `/api/devices/pair` | Pair a device via BT/Wi-Fi (persisted to DB) |
| `DELETE` | `/api/devices/{device_id}` | Remove a device from the registry |
| `POST` | `/api/devices/{device_id}/heartbeat` | Update last_seen and mark online |
| `POST` | `/api/devices/{device_id}/online` | Set device online/offline status |
| `POST` | `/api/devices/scan/wifi` | Scan local network via ARP table |
| `POST` | `/api/devices/scan/bluetooth` | Scan for BLE devices via bleak |
| `POST` | `/api/devices/pair-discovered` | Pair a device found via scanning |
| `POST` | `/api/transfer/upload` | Upload file to transfer queue |
| `POST` | `/api/transfer/upload-folder` | Zip & upload entire folder (multipart files + paths) |
| `POST` | `/api/transfer/link` | Send link to a device |
| `GET` | `/api/transfer/pending/{device_id}` | Pending transfers for device |
| `GET` | `/api/transfer/download/{transfer_id}` | Download transferred file |
| `POST` | `/api/transfer/accept/{transfer_id}` | Accept a transfer (notifies sender via SSE) |
| `POST` | `/api/transfer/decline/{transfer_id}` | Decline a transfer (notifies sender via SSE) |
| `GET` | `/api/transfer/incoming/{device_id}` | All non-declined incoming transfers for device |
| `GET` | `/api/transfer/history` | Transfer history (last 50) |
| `GET` | `/api/transfer/notifications/{device_id}` | SSE stream for real-time transfer push |
| `GET` | `/api/mobile/health` | Mobile device health check |
| `POST` | `/api/gesture/event` | Process gesture events |
| `POST` | `/api/gesture/train` | Train a custom gesture |
| `GET` | `/api/gesture/custom` | List custom gestures |
| `DELETE` | `/api/gesture/custom/{name}` | Delete a custom gesture |
| `POST` | `/api/sign/event` | Process sign language events |
| `POST` | `/api/sign/train` | Train a sign |
| `POST` | `/api/sign/train/bulk` | Bulk train signs |
| `POST` | `/api/sign/predict` | Predict a sign from landmarks |
| `GET` | `/api/sign/vocabulary` | Full ASL vocabulary |
| `GET` | `/api/sign/stats` | User sign training stats |
| `GET` | `/api/memory/personal` | Personal memory |
| `POST` | `/api/settings/avatar` | Save avatar settings (theme, expression, speed, animation) |
| `GET` | `/api/settings/aws/status` | AWS credential status + engine health |
| `POST` | `/api/settings/aws` | Save AWS credentials & reinit engines |
| `POST` | `/api/settings/aws/test` | Test AWS credentials (dry run) |
| `POST` | `/api/settings/aws/clear` | Clear credentials, revert to heuristic mode |
| `POST` | `/api/live/stream` | Live SSE streaming |
| `POST` | `/api/generate/image` | Generate image via Nova |
| `POST` | `/api/generate/video` | Generate video via Nova |
| `WebSocket` | `/ws/live` | Live multimodal WebSocket |
| `WebSocket` | `/ws/voice/sonic` | Bidirectional voice streaming (Nova Sonic) |
| `POST` | `/api/act/analyze` | Nova Act UI analysis |
| `POST` | `/api/voice/synthesize` | Voice synthesis |

---

## 15. Security

- API key authentication (`x-api-key` header)
- User ID resolution from request context
- CORS middleware with allowlisted origins + regex pattern
- Capacitor / Ionic origin support
- Audit logging (method, path, status, duration)
- CloudWatch logging (production-ready, disabled locally)

---

## 16. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3, Vite 5.4 |
| Styling | Custom CSS (glassmorphism, dark theme) |
| Mobile | Capacitor 6/8 (Android + iOS) |
| Hand Tracking | MediaPipe Hands |
| Speech | Web Speech API (SpeechRecognition + SpeechSynthesis) |
| Backend | FastAPI, Python 3.11+, Uvicorn |
| AI Models | Amazon Nova 2 (Lite, Pro, Omni, Sonic, Act, Forge) |
| LLM Framework | LangChain (langchain-aws, ChatBedrockConverse) |
| Cloud | AWS (Bedrock, S3, CloudWatch) |
| Automation | pyautogui, webbrowser, Nova Act |
| Sign ML | scikit-learn (KNN classifier) |
