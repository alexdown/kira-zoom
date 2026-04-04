# DESIGN.md — AI Meeting Bot (Zoom via Recall.ai)

> A bot that joins Zoom calls, listens, reads papers beforehand, raises its hand during Q&A, and asks intelligent questions aloud.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          OPERATOR / CLI / UI                            │
│  curl / CLI tool / simple web dashboard                                 │
│  POST /sessions, POST /sessions/:id/raise-hand, etc.                   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTP
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        CONTROL SERVER (Node.js)                          │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  Session Mgr  │  │  Paper Brain │  │  Q&A       │  │  Speaker     │  │
│  │              │  │              │  │  Detector  │  │  (TTS +      │  │
│  │ - create bot │  │ - ingest PDF │  │            │  │   audio out) │  │
│  │ - lifecycle  │  │ - summarize  │  │ - keyword  │  │              │  │
│  │ - state FSM  │  │ - gen Qs     │  │   matching │  │ - OpenAI TTS │  │
│  │              │  │              │  │ - LLM      │  │ - output_    │  │
│  │              │  │ - RAG/embed  │  │   classify │  │   audio POST │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘  │
│         │                 │                │                │           │
│         │    ┌────────────┴────────────────┴────────────────┘           │
│         │    │                                                          │
│         │    ▼                                                          │
│  ┌──────┴────────────────────────────────┐                              │
│  │         LLM Service (OpenAI)          │                              │
│  │  - paper summarization (gpt-4o)       │                              │
│  │  - question generation                │                              │
│  │  - Q&A moment classification          │                              │
│  │  - question refinement from context   │                              │
│  └───────────────────────────────────────┘                              │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           │  Recall.ai REST API (ap-northeast-1)
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       RECALL.AI INFRASTRUCTURE                           │
│                                                                          │
│  ┌─────────────────────┐      ┌──────────────────────────────────────┐  │
│  │   Recall Bot        │      │   Avatar Webpage (output_media)      │  │
│  │                     │      │                                      │  │
│  │ - joins Zoom call   │◄────►│ - served from our server or static   │  │
│  │ - captures audio    │      │ - receives audio via getUserMedia()  │  │
│  │ - sends transcripts │      │ - receives transcripts via WS        │  │
│  │   via webhook/WS    │      │ - shows avatar + hand-raised state   │  │
│  │ - plays audio out   │      │ - communicates with control server   │  │
│  │ - sends chat msgs   │      │   via postMessage / WS               │  │
│  └─────────────────────┘      └──────────────────────────────────────┘  │
│                                                                          │
│                        ┌──────────────┐                                  │
│                        │  Zoom Call    │                                  │
│                        │  (meeting)    │                                  │
│                        └──────────────┘                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
Paper (PDF) ──► Paper Brain ──► Questions (ranked)
                                      │
Zoom Audio ──► Recall Bot ──► Transcripts ──► Q&A Detector
                                                    │
                              ┌──────────────────────┘
                              ▼
                    Q&A detected? ──yes──► Raise Hand
                                            │
                              Called upon? ──┘
                                  │
                                  ▼
                        Speak Question (TTS ──► output_audio)
```

---

## 2. Component Breakdown

### 2.1 Control Server (`server/`)

The central orchestrator. A Node.js/Express HTTP server that:

- Exposes a REST API for operators (create session, raise hand, speak, leave)
- Manages bot lifecycle via Recall.ai API
- Maintains a finite state machine per session
- Coordinates all other components

**Session State Machine:**

```
IDLE ──► PREPARING ──► JOINING ──► LISTENING ──► HAND_RAISED ──► SPEAKING ──► LISTENING
  │         │             │            │              │               │            │
  │         │             │            └──────────────┘               │            │
  │         │             │                                          │            │
  └─────────┴─────────────┴──────────────────────────────────────────┴────► LEAVING ──► DONE
```

States:
| State | Description |
|-------|-------------|
| `IDLE` | Session created, no bot yet |
| `PREPARING` | Paper ingested, questions generated, waiting to join |
| `JOINING` | Bot creation request sent to Recall.ai, waiting for it to enter call |
| `LISTENING` | In the meeting, processing transcripts, watching for Q&A |
| `HAND_RAISED` | Hand raised (chat msg sent + avatar updated), waiting to be called on |
| `SPEAKING` | Delivering the question via TTS → output_audio |
| `LEAVING` | Bot leaving the call |
| `DONE` | Session complete, bot removed |

### 2.2 Paper Brain (`lib/paper-brain.ts`)

Responsible for understanding the document and preparing questions.

- **Input:** PDF file or plain text
- **Processing:**
  1. Extract text from PDF (via `pdf-parse`)
  2. Chunk into sections (~2000 tokens each)
  3. Send to GPT-4o with prompt: "Summarize this paper's key claims, methodology, and conclusions"
  4. Generate 3-5 ranked questions with rationale
  5. Store questions + paper context in session state
- **Output:** `{ summary, questions: [{ text, rationale, priority }] }`

### 2.3 Q&A Detector (`lib/qa-detector.ts`)

Monitors the live transcript stream and decides when it's time to raise a hand.

**Two-tier detection:**

1. **Keyword heuristic (fast, cheap):** Regex scan for patterns like:
   - "any questions"
   - "open the floor"
   - "Q&A"
   - "does anyone have"
   - "questions or comments"
   - "who would like to"
   - Speaker changes from presenter to moderator
   
2. **LLM classifier (slower, smarter):** If keyword fires, send the last ~60 seconds of transcript to GPT-4o-mini:
   - "Is this a genuine Q&A invitation or just rhetorical? Reply YES or NO with confidence 0-1."
   - Only raise hand if confidence > 0.7

**Debounce:** Don't fire more than once per 3 minutes. If hand was already raised, skip.

### 2.4 Speaker (`lib/speaker.ts`)

Converts text to audio and sends it to the meeting.

- **TTS engine:** OpenAI TTS API (`tts-1` model, `nova` or `alloy` voice)
  - Why not OpenAI Realtime API? We don't need real-time conversation — we have a prepared question. Standard TTS is simpler, cheaper, and gives us an audio file we can preview before sending.
- **Flow:**
  1. Take the top-ranked question text
  2. Optionally refine it based on recent transcript context (so it doesn't repeat what was already discussed)
  3. Generate TTS audio (mp3)
  4. POST to Recall.ai `output_audio` endpoint as base64
- **Prefetch:** Generate TTS audio at `HAND_RAISED` state so there's no delay when called upon.

### 2.5 Avatar Webpage (`client/`)

A lightweight React page that Recall.ai renders as the bot's video feed.

**Features:**
- Shows an avatar image (configurable — could be a cartoon, photo, or abstract)
- Displays bot name
- **Hand raised state:** Large ✋ emoji animation overlaid when hand is raised
- **Speaking state:** Audio waveform / pulsing animation when bot is speaking
- **Idle state:** Subtle breathing/idle animation so the tile doesn't look frozen

**Communication with Control Server:**
- The webpage connects to our control server via WebSocket
- Server pushes state changes: `{ state: "hand_raised" }`, `{ state: "speaking" }`, etc.
- Webpage also receives meeting audio via `getUserMedia()` and transcript via Recall WS — these are forwarded to our server for Q&A detection

**Note:** The webpage runs inside Recall.ai's infrastructure. It must be publicly accessible (served via our server or a CDN). The Recall.ai bot loads it via URL.

### 2.6 Transcript Processor (`lib/transcript.ts`)

Handles the real-time transcript stream:

- Connects to Recall.ai transcript webhook or WebSocket
- Normalizes transcript segments: `{ speaker, text, timestamp }`
- Maintains a rolling buffer (last 10 minutes)
- Feeds segments to Q&A Detector
- Stores full transcript for post-meeting review

---

## 3. Repository Structure

```
ai-meeting-bot/
├── README.md
├── DESIGN.md                    # this document
├── package.json
├── tsconfig.json
├── .env.example                 # RECALL_API_KEY, OPENAI_API_KEY, etc.
├── .gitignore
│
├── server/                      # Control server (Node.js + Express)
│   ├── index.ts                 # Entry point, Express app setup
│   ├── routes/
│   │   ├── sessions.ts          # CRUD for meeting sessions
│   │   ├── control.ts           # raise-hand, speak, leave commands
│   │   └── papers.ts            # paper upload + processing
│   ├── services/
│   │   ├── recall.ts            # Recall.ai API client wrapper
│   │   ├── session-manager.ts   # Session state machine + lifecycle
│   │   ├── paper-brain.ts       # PDF ingestion + question generation
│   │   ├── qa-detector.ts       # Transcript monitoring + Q&A detection
│   │   ├── speaker.ts           # TTS generation + audio output
│   │   ├── transcript.ts        # Real-time transcript processor
│   │   └── llm.ts               # OpenAI API wrapper (shared)
│   ├── types.ts                 # TypeScript interfaces
│   └── config.ts                # Environment config + defaults
│
├── client/                      # Avatar webpage (Vite + React)
│   ├── index.html
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx              # Main avatar component
│   │   ├── components/
│   │   │   ├── Avatar.tsx       # Avatar image/animation
│   │   │   ├── HandRaised.tsx   # ✋ overlay animation
│   │   │   ├── Speaking.tsx     # Audio waveform overlay
│   │   │   └── StatusBar.tsx    # Bot name + status text
│   │   ├── hooks/
│   │   │   ├── useServerWS.ts   # WebSocket to control server
│   │   │   └── useMeetingAudio.ts # getUserMedia for meeting audio
│   │   └── styles/
│   │       └── avatar.css
│   └── public/
│       └── avatars/             # Default avatar images
│
├── cli/                         # CLI tool for manual control
│   ├── index.ts                 # Commander.js CLI entry
│   └── commands/
│       ├── join.ts              # Join a meeting with a paper
│       ├── status.ts            # Check session status
│       ├── raise-hand.ts        # Manual raise hand
│       ├── speak.ts             # Manual speak (text or question #)
│       └── leave.ts             # Leave meeting
│
├── papers/                      # Uploaded papers (gitignored)
│
├── scripts/
│   ├── dev.sh                   # Start server + client in dev mode
│   └── deploy.sh                # Build + deploy (e.g., to Railway/Fly.io)
│
├── test/
│   ├── paper-brain.test.ts
│   ├── qa-detector.test.ts
│   └── speaker.test.ts
│
└── docker/
    ├── Dockerfile               # Production build
    └── docker-compose.yml       # Local dev with all services
```

---

## 4. API Design

### Base URL: `http://localhost:3000/api`

### 4.1 Sessions

#### `POST /api/sessions` — Create a new meeting session

```json
// Request
{
  "meetingUrl": "https://zoom.us/j/123456789?pwd=abc",
  "botName": "Research Assistant",
  "avatarUrl": "https://example.com/avatar.png",  // optional
  "paperFile": "<multipart upload>",               // optional
  "paperText": "...",                               // alternative to file
  "autoRaiseHand": true,                           // auto-detect Q&A and raise hand
  "autoSpeak": false,                              // auto-speak when called on (default: wait for manual trigger)
  "config": {
    "ttsVoice": "nova",                            // OpenAI TTS voice
    "maxQuestions": 3,                             // how many questions to prepare
    "qaDetectionSensitivity": "medium"             // low/medium/high
  }
}

// Response 201
{
  "sessionId": "sess_abc123",
  "state": "PREPARING",
  "questions": [],                                 // populated after paper processing
  "createdAt": "2026-04-04T05:00:00Z"
}
```

#### `GET /api/sessions/:id` — Get session status

```json
// Response 200
{
  "sessionId": "sess_abc123",
  "state": "LISTENING",
  "botId": "recall_bot_xyz",                       // Recall.ai bot ID
  "meetingUrl": "https://zoom.us/j/123456789",
  "questions": [
    {
      "id": "q1",
      "text": "How did you control for selection bias in the cohort study?",
      "rationale": "The paper mentions observational data but doesn't discuss propensity matching.",
      "priority": 1,
      "status": "ready"                            // ready | raised | asked | skipped
    }
  ],
  "transcript": [                                  // last N segments
    { "speaker": "Dr. Smith", "text": "...and that concludes our findings.", "ts": 1712203200 }
  ],
  "handRaisedAt": null,
  "spokeAt": null,
  "createdAt": "2026-04-04T05:00:00Z"
}
```

#### `GET /api/sessions` — List all sessions

#### `DELETE /api/sessions/:id` — End session + remove bot

### 4.2 Control Commands

#### `POST /api/sessions/:id/raise-hand` — Raise hand

```json
// Request (optional body)
{
  "questionId": "q1",                              // which question to ask (default: top priority)
  "message": "✋ I have a question about methodology"  // custom chat message (optional)
}

// Response 200
{
  "state": "HAND_RAISED",
  "chatMessageSent": true,
  "selectedQuestion": "q1"
}
```

#### `POST /api/sessions/:id/speak` — Speak now

```json
// Request (optional — override question)
{
  "questionId": "q1",                              // or...
  "text": "Custom text to speak instead",          // override with arbitrary text
  "refineFromTranscript": true                     // use recent context to refine wording
}

// Response 200
{
  "state": "SPEAKING",
  "spokenText": "How did you control for selection bias...",
  "audioDurationMs": 4200
}
```

#### `POST /api/sessions/:id/lower-hand` — Lower hand (cancel)

#### `POST /api/sessions/:id/send-chat` — Send arbitrary chat message

```json
{ "message": "Thank you for the presentation!" }
```

#### `POST /api/sessions/:id/leave` — Leave the meeting

### 4.3 Papers

#### `POST /api/papers/analyze` — Analyze a paper without joining a meeting

```json
// Request: multipart form with PDF file, or:
{ "text": "..." }

// Response 200
{
  "summary": "This paper presents...",
  "questions": [
    { "text": "...", "rationale": "...", "priority": 1 }
  ]
}
```

### 4.4 WebSocket (for avatar webpage + live monitoring)

#### `ws://localhost:3000/ws/sessions/:id`

Server pushes events:

```json
{ "type": "state_change", "state": "HAND_RAISED" }
{ "type": "transcript", "speaker": "Dr. Smith", "text": "Any questions?" }
{ "type": "qa_detected", "confidence": 0.85, "trigger": "any questions" }
{ "type": "speaking", "text": "How did you control...", "durationMs": 4200 }
{ "type": "error", "message": "Bot disconnected from call" }
```

---

## 5. Data Flow — Key Scenarios

### 5.1 Joining a Meeting with a Paper

```
Operator                    Control Server              Recall.ai          Zoom
   │                             │                         │                │
   │  POST /sessions             │                         │                │
   │  { meetingUrl, paperFile }  │                         │                │
   │────────────────────────────►│                         │                │
   │                             │                         │                │
   │                             │── extract PDF text      │                │
   │                             │── send to GPT-4o        │                │
   │                             │   "summarize + gen Qs"  │                │
   │                             │◄─ { summary, questions }│                │
   │                             │                         │                │
   │                             │── state: PREPARING→JOINING               │
   │                             │                         │                │
   │                             │  POST /api/v1/bot       │                │
   │                             │  { meeting_url,         │                │
   │                             │    bot_name,            │                │
   │                             │    output_media: {      │                │
   │                             │      camera: {          │                │
   │                             │        kind: "webpage", │                │
   │                             │        url: avatarUrl   │                │
   │                             │      }                  │                │
   │                             │    }                    │                │
   │                             │  }                      │                │
   │                             │────────────────────────►│                │
   │                             │                         │── Bot joins ──►│
   │                             │                         │                │
   │                             │◄── webhook: bot_joined  │                │
   │                             │── state: JOINING→LISTENING               │
   │  ◄── 201 { sessionId,      │                         │                │
   │       state, questions }    │                         │                │
```

### 5.2 Listening and Detecting Q&A

```
Zoom Call                   Recall.ai              Control Server
   │                            │                       │
   │  Audio stream              │                       │
   │───────────────────────────►│                       │
   │                            │── transcribe          │
   │                            │                       │
   │                            │  transcript segment   │
   │                            │──────────────────────►│
   │                            │  (webhook or WS)      │
   │                            │                       │── buffer transcript
   │                            │                       │── keyword scan: "any questions?"
   │                            │                       │   ✓ MATCH
   │                            │                       │
   │                            │                       │── send last 60s to GPT-4o-mini
   │                            │                       │   "Is this a genuine Q&A invitation?"
   │                            │                       │◄─ { "yes", confidence: 0.9 }
   │                            │                       │
   │                            │                       │── emit: qa_detected
   │                            │                       │── if autoRaiseHand: trigger raise-hand
```

### 5.3 Raising Hand

```
Control Server              Recall.ai              Zoom Call         Avatar Webpage
      │                         │                      │                   │
      │── state: HAND_RAISED    │                      │                   │
      │                         │                      │                   │
      │  POST send_chat_message │                      │                   │
      │  "✋ Research Assistant  │                      │                   │
      │   has a question about  │                      │                   │
      │   the methodology"      │                      │                   │
      │────────────────────────►│── chat message ─────►│                   │
      │                         │                      │                   │
      │── WS: { state:          │                      │                   │
      │    "HAND_RAISED" }      │                      │                   │
      │─────────────────────────┼──────────────────────┼──────────────────►│
      │                         │                      │                   │── show ✋ animation
      │                         │                      │                   │   on video tile
      │                         │                      │                   │
      │── pre-generate TTS      │                      │                   │
      │   for top question      │                      │                   │
      │   (cache audio)         │                      │                   │
```

### 5.4 Speaking the Question

```
Operator/Auto               Control Server              Recall.ai          Zoom
      │                           │                         │                │
      │  POST /speak              │                         │                │
      │  (or auto-triggered       │                         │                │
      │   when called upon)       │                         │                │
      │──────────────────────────►│                         │                │
      │                           │                         │                │
      │                           │── state: SPEAKING       │                │
      │                           │                         │                │
      │                           │── (optional) refine Q   │                │
      │                           │   with recent transcript│                │
      │                           │   via GPT-4o            │                │
      │                           │                         │                │
      │                           │── get cached TTS audio  │                │
      │                           │   (or generate now)     │                │
      │                           │                         │                │
      │                           │  POST output_audio      │                │
      │                           │  { audio: base64_mp3 }  │                │
      │                           │────────────────────────►│                │
      │                           │                         │── play audio──►│
      │                           │                         │   (bot speaks) │
      │                           │                         │                │
      │                           │── update avatar: speaking animation      │
      │                           │── state: SPEAKING→LISTENING              │
      │                           │── lower hand (remove ✋)                 │
```

### 5.5 Leaving

```
Operator                    Control Server              Recall.ai          Zoom
   │                             │                         │                │
   │  DELETE /sessions/:id       │                         │                │
   │  (or POST /leave)           │                         │                │
   │────────────────────────────►│                         │                │
   │                             │── state: LEAVING        │                │
   │                             │                         │                │
   │                             │  (optional) send chat:  │                │
   │                             │  "Thanks for the talk!" │                │
   │                             │────────────────────────►│                │
   │                             │                         │                │
   │                             │  DELETE /api/v1/bot/:id │                │
   │                             │────────────────────────►│── Bot leaves──►│
   │                             │                         │                │
   │                             │── state: DONE           │                │
   │                             │── save transcript log   │                │
   │  ◄── 200 { transcript,     │                         │                │
   │       questionsAsked }      │                         │                │
```

---

## 6. Tech Stack Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Node.js 20+ / TypeScript | Matches Recall.ai voice-agent-demo. Strong async/WS support. Fast ecosystem for prototyping. |
| **Server framework** | Express.js | Simple, well-understood, low overhead. Fastify is fine too — not critical for this use case. |
| **Client framework** | Vite + React | Same as Recall.ai demo. Hot reload for avatar development. Lightweight build. |
| **LLM** | OpenAI GPT-4o (paper analysis, question gen) + GPT-4o-mini (Q&A detection) | Best quality for reasoning tasks. 4o-mini is cheap enough for real-time classification (~$0.15/1M input tokens). |
| **TTS** | OpenAI TTS API (`tts-1`) | Good quality, simple API, ~$15/1M chars. We don't need real-time streaming — we have a prepared question. Generates full audio file we can cache and preview. |
| **PDF parsing** | `pdf-parse` (npm) | Lightweight, no native dependencies. Falls back to `pdfjs-dist` for complex PDFs. |
| **Database** | SQLite (via `better-sqlite3`) for MVP | Sessions, transcripts, questions. No need for Postgres until we have multiple operators or persistence requirements. |
| **WebSocket** | `ws` (npm) | For avatar webpage communication and live monitoring. |
| **Deployment** | Railway or Fly.io | Need a publicly accessible URL for the avatar webpage. Both support Node.js + static files. Fly.io has ap-northeast-1 region matching Recall.ai. |

### Why NOT OpenAI Realtime API?

The Recall.ai demo uses it for real-time voice conversations. We don't need that — our bot has a **prepared question**, not a free-form conversation. Using standard TTS:
- **Cheaper** (~10x less than Realtime API)
- **More predictable** (we know exactly what will be said)
- **Previewable** (operator can listen before sending)
- **Simpler** (no bidirectional audio stream management)

If we later want the bot to have follow-up conversations, we can add the Realtime API as an optional mode.

---

## 7. MVP Scope

### MVP (Week 1-2): "It joins, it listens, it asks"

Build the minimum that demonstrates the core value:

1. **Control server** with basic session CRUD
2. **Recall.ai integration** — create bot, join meeting, get transcripts
3. **Paper brain** — PDF upload → GPT-4o → 3 questions
4. **Manual raise hand** — operator triggers via API → chat message sent
5. **Manual speak** — operator triggers → TTS audio → output_audio
6. **Simple avatar** — static image with ✋ overlay (CSS animation, no fancy graphics)
7. **CLI tool** — `join`, `status`, `raise-hand`, `speak`, `leave`

**What's NOT in MVP:**
- Auto Q&A detection (just manual trigger)
- Auto-speak when called upon
- Question refinement from transcript context
- Database (in-memory sessions)
- Web dashboard
- Animated avatar

### Phase 2 (Week 3-4): "It knows when to raise its hand"

8. **Q&A detector** — keyword matching + LLM classifier
9. **Auto raise hand** mode
10. **Question refinement** — adjust question based on what's been discussed
11. **TTS prefetch** — generate audio at raise-hand time
12. **SQLite persistence** — survive restarts, transcript logs

### Phase 3 (Week 5+): "Full autonomy"

13. **Auto-detect when called upon** — LLM monitors for "go ahead" / bot's name mentioned
14. **Animated avatar** — lip sync, expressions, smooth state transitions
15. **Web dashboard** — real-time view of transcript, bot state, question queue
16. **Multi-bot** — multiple sessions simultaneously
17. **Post-meeting report** — summary, Q&A log, follow-up items

---

## 8. Configuration

### Environment Variables (`.env`)

```bash
# Recall.ai
RECALL_API_KEY=your_recall_api_key
RECALL_REGION=ap-northeast-1

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Server
PORT=3000
AVATAR_PUBLIC_URL=https://your-deployed-app.fly.dev/avatar

# Bot defaults
DEFAULT_BOT_NAME="Research Assistant"
DEFAULT_TTS_VOICE=nova
DEFAULT_AVATAR_IMAGE=https://your-cdn.com/avatar.png
```

### Key Recall.ai API Calls

**Create Bot:**
```typescript
const response = await fetch('https://ap-northeast-1.recall.ai/api/v1/bot', {
  method: 'POST',
  headers: {
    'Authorization': `Token ${RECALL_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    meeting_url: meetingUrl,
    bot_name: botName,
    transcription_options: {
      provider: 'meeting_captions'
    },
    real_time_transcription: {
      destination_url: `${SERVER_URL}/api/webhooks/transcript`
      // or use websocket
    },
    output_media: {
      camera: {
        kind: 'webpage',
        config: {
          url: `${AVATAR_PUBLIC_URL}?sessionId=${sessionId}`
        }
      }
    },
    chat: {
      on_bot_join: {
        send_to: 'everyone',
        message: '👋 Hi! I\'m a Research Assistant bot here to ask questions about the paper.'
      }
    }
  })
});
```

**Send Chat Message (Raise Hand):**
```typescript
await fetch(`https://ap-northeast-1.recall.ai/api/v1/bot/${botId}/send_chat_message`, {
  method: 'POST',
  headers: { 'Authorization': `Token ${RECALL_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '✋ Research Assistant would like to ask a question about the methodology.'
  })
});
```

**Output Audio (Speak):**
```typescript
await fetch(`https://ap-northeast-1.recall.ai/api/v1/bot/${botId}/output_audio`, {
  method: 'POST',
  headers: { 'Authorization': `Token ${RECALL_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: audioBase64  // mp3 or wav base64-encoded
  })
});
```

---

## 9. Raise Hand Strategy — Detailed

Since Recall.ai has **no native raise-hand endpoint**, we use a combined approach:

### Option C: Chat Message + Visual Indicator (Recommended)

**Chat message** — visible to all participants in the chat panel:
```
✋ Research Assistant has a question about the study methodology.
```

**Why include the topic?** It tells the moderator the question is relevant and worth calling on. Compare:
- Bad: "✋ Bot wants to speak"
- Good: "✋ Research Assistant has a question about the control group selection in Figure 3"

**Avatar visual** — the bot's video tile shows a clear hand-raised indicator:
- Large ✋ emoji (animated, gently bouncing)
- Background color shifts to a warm amber
- Status text: "Has a question"

**Together:** Participants who watch chat see the message. Participants who look at the gallery view see the raised hand on the avatar. Maximum visibility.

### Detecting When Called Upon

This is the hardest part. The bot needs to know when the moderator says "go ahead" or calls its name.

**MVP approach:** Manual trigger. Operator watches and clicks "Speak" when the bot is called on.

**Phase 3 approach:** Monitor transcript for:
- Bot name mentioned ("Research Assistant, go ahead")
- Generic invitation after hand raise ("yes, please", "go ahead", "your question?")
- Use LLM to classify: "Given that our bot raised its hand 30 seconds ago, does this transcript segment indicate the bot is being invited to speak?"

---

## 10. Open Questions & Risks

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Recall.ai output_audio latency** — how fast does audio start playing after POST? | High | Test early in MVP. If >2s delay, pre-buffer "Thank you for the opportunity..." intro while main question loads. |
| **Transcript quality** — meeting captions may be noisy, affecting Q&A detection | Medium | Use `meeting_captions` provider (uses Zoom's built-in captions). Fall back to Recall.ai's Deepgram/Assembly option if quality is poor. |
| **Avatar webpage reliability** — if our server goes down, the bot's video tile dies | Medium | Host avatar on CDN as static files. WebSocket disconnect = show static fallback state. |
| **output_audio format requirements** — exact format/encoding constraints unknown | Medium | Test mp3 and wav. The Recall.ai docs suggest base64-encoded audio. Start with 16kHz mono wav. |
| **Bot admission** — Zoom waiting rooms may block the bot | Medium | Document that host must admit the bot. No workaround via Recall.ai. |

### Product Questions

| Question | Notes |
|----------|-------|
| **Should the bot introduce itself?** | Probably yes. Send a chat message on join explaining it's an AI assistant with a question about the paper. Configurable. |
| **Multiple questions per meeting?** | MVP: one question. Later: queue of questions with priority. Operator can cycle through. |
| **Should the bot respond to follow-ups?** | Out of scope for MVP. Phase 3 could add conversational mode via OpenAI Realtime API. |
| **Privacy/consent?** | The bot is visible in the participant list. Its name makes clear it's a bot. Meeting host admits it. This should be sufficient for most contexts. Document in README. |
| **What if Q&A never happens?** | Bot sits quietly and leaves when meeting ends (or on timeout). Transcript is still captured as value. |

### Cost Estimate (per meeting)

| Item | Cost |
|------|------|
| Recall.ai bot (1 hour) | $0.50 |
| Recall.ai transcription (1 hour) | $0.15 |
| GPT-4o paper analysis (~10K tokens) | ~$0.05 |
| GPT-4o-mini Q&A detection (5 calls × ~1K tokens) | ~$0.001 |
| OpenAI TTS (one question, ~200 chars) | ~$0.003 |
| **Total per 1-hour meeting** | **~$0.70** |

First 5 hours of Recall.ai are free — enough for ~5 test meetings.

---

## 11. Quick Start (for README.md)

```bash
# Clone
git clone https://github.com/yourorg/ai-meeting-bot.git
cd ai-meeting-bot

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your RECALL_API_KEY and OPENAI_API_KEY

# Dev mode (server + avatar webpage)
npm run dev

# Join a meeting with a paper
npx tsx cli/index.ts join \
  --meeting-url "https://zoom.us/j/123456789?pwd=abc" \
  --paper ./papers/research-paper.pdf \
  --bot-name "Research Assistant"

# Check status
npx tsx cli/index.ts status sess_abc123

# Raise hand
npx tsx cli/index.ts raise-hand sess_abc123

# Speak the top question
npx tsx cli/index.ts speak sess_abc123

# Leave
npx tsx cli/index.ts leave sess_abc123
```

---

## 12. Summary

This system is a **control server + avatar webpage** that orchestrates a Recall.ai bot. The key insight: Recall.ai handles the hard parts (joining calls, audio I/O, transcription), and we handle the intelligence (paper understanding, timing, question delivery).

The MVP is achievable in 1-2 weeks by one developer. The critical path is:

1. Get Recall.ai bot joining a Zoom call ✓
2. Get transcripts flowing to our server ✓
3. PDF → questions via GPT-4o ✓
4. Chat message as raise-hand ✓
5. TTS → output_audio as speak ✓

Everything else — Q&A auto-detection, animated avatar, auto-speak — is progressive enhancement on top of a working foundation.
