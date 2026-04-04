# UI_DESIGN.md — Kira Dashboard (Operator Control Panel)

> A single-page web dashboard for operating the Kira AI Meeting Bot.
> Replaces CLI/curl workflows with a visual interface anyone can use.
>
> Last updated: 2026-04-04

---

## Table of Contents

1. [Overview](#1-overview)
2. [Wireframes](#2-wireframes)
3. [Component Tree](#3-component-tree)
4. [State Management](#4-state-management)
5. [API Contract](#5-api-contract)
6. [WebSocket Events](#6-websocket-events)
7. [Color Palette & Typography](#7-color-palette--typography)
8. [User Flows](#8-user-flows)
9. [File Structure](#9-file-structure)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. Overview

### What this is

A **separate React + Vite app** (in `dashboard/`) served by the existing Express server at `/dashboard`. The operator opens this in their browser to control Kira before, during, and after a Zoom meeting.

### What this is NOT

- **Not the avatar client** — that's `client/`, which runs inside Recall.ai's bot browser and renders the HeyGen LiveAvatar. The dashboard never touches HeyGen directly.
- **Not mobile-first** — designed for laptop/desktop (1280px+). No mobile breakpoints.

### Key principles

- **Single screen** — everything visible at once, no page navigation. Panels scroll independently.
- **Real-time** — WebSocket-driven transcript and status updates, no polling.
- **Operational** — this is a control panel, not a marketing page. Dense, functional, information-forward.

---

## 2. Wireframes

### 2.1 Full Layout (1440px viewport)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ◉ KIRA   AI Meeting Bot Control                             [⚙ Settings]  │
│                                                                             │
├───────────────────────────────┬─────────────────────────────────────────────┤
│                               │                                             │
│  ┌─ PREPARATION ────────────┐ │  ┌─ LIVE TRANSCRIPT ──────────────────────┐ │
│  │                          │ │  │                                        │ │
│  │  📄 Paper                 │ │  │  ┌─ 09:14:22 ──────────────────────┐  │ │
│  │  ┌────────────────────┐  │ │  │  │ Dr. Smith                       │  │ │
│  │  │ [Upload PDF/DOCX]  │  │ │  │  │ ...and that concludes our       │  │ │
│  │  │  or paste text ▾   │  │ │  │  │ findings on the cohort study.   │  │ │
│  │  └────────────────────┘  │ │  │  └─────────────────────────────────┘  │ │
│  │                          │ │  │                                        │ │
│  │  Paper: research.pdf ✓   │ │  │  ┌─ 09:14:35 ──────────────────────┐  │ │
│  │  "A Longitudinal Study   │ │  │  │ Moderator                       │  │ │
│  │   of Cloud Migration..."  │ │  │  │ Thank you Dr. Smith. Do we      │  │ │
│  │  [Show full summary ▾]   │ │  │  │ have any questions?              │  │ │
│  │                          │ │  │  └─────────────────────────────────┘  │ │
│  │  ─────────────────────── │ │  │                                        │ │
│  │                          │ │  │  ┌─ 09:14:41 ──────── [Q&A ●] ────┐  │ │
│  │  🧠 Questions             │ │  │  │ Kira (AI Principal SA)         │  │ │
│  │  [Generate Questions]    │ │  │  │ Hi, I'm Kira, your Amazonian   │  │ │
│  │                          │ │  │  │ AI. I have a question about...  │  │ │
│  │  ⠿ 1. How did you        │ │  │  └─────────────────────────────────┘  │ │
│  │     control for           │ │  │                                        │ │
│  │     selection bias in     │ │  │                     ┌────────────────┐ │ │
│  │     the cohort study?     │ │  │                     │ ⬇ Auto-scroll │ │ │
│  │     Rationale: The paper  │ │  │                     └────────────────┘ │ │
│  │     mentions observational│ │  │                                        │ │
│  │     data but doesn't...   │ │  └────────────────────────────────────────┘ │
│  │     [Edit] [Delete]  ●   │ │                                             │
│  │                          │ │  ┌─ STATUS ──────────────────────────────┐ │
│  │  ⠿ 2. What was the       │ │  │                                        │ │
│  │     sample size           │ │  │  Bot         ● In Call (recording)    │ │
│  │     justification?        │ │  │  HeyGen      ● Connected              │ │
│  │     [Edit] [Delete]  ○   │ │  │  Transcript   ● Streaming              │ │
│  │                          │ │  │  Session      ● LISTENING              │ │
│  │  ⠿ 3. Could you discuss  │ │  │                                        │ │
│  │     the external          │ │  │  Duration     12:34                   │ │
│  │     validity concerns?    │ │  │  Segments     47                      │ │
│  │     [Edit] [Delete]  ○   │ │  │  Questions    1/3 asked               │ │
│  │                          │ │  │                                        │ │
│  │  [+ Add Question]        │ │  └────────────────────────────────────────┘ │
│  │                          │ │                                             │
│  │  ─────────────────────── │ ├─────────────────────────────────────────────┤
│  │                          │ │                                             │
│  │  💬 Context               │ │  ┌─ MEETING CONTROL ────────────────────┐ │
│  │  System prompt for Kira's │ │  │                                        │ │
│  │  personality during the   │ │  │  Zoom URL                              │ │
│  │  meeting.                 │ │  │  ┌──────────────────────────────────┐  │ │
│  │  ┌────────────────────┐  │ │  │  │ https://zoom.us/j/123456789     │  │ │
│  │  │ You are Kira, an   │  │ │  │  └──────────────────────────────────┘  │ │
│  │  │ AI Principal SA... │  │ │  │                                        │ │
│  │  │                    │  │ │  │  Bot Name                               │ │
│  │  └────────────────────┘  │ │  │  ┌──────────────────────────────────┐  │ │
│  │  [Save Context]          │ │  │  │ Kira (AI Principal SA)           │  │ │
│  │                          │ │  │  └──────────────────────────────────┘  │ │
│  └──────────────────────────┘ │  │                                        │ │
│                               │  │  ┌────────────┐  ┌──────────────────┐  │ │
│                               │  │  │ 🚀 Join     │  │ 🚪 Leave Meeting │  │ │
│                               │  │  │   Meeting   │  │                  │  │ │
│                               │  │  └────────────┘  └──────────────────┘  │ │
│                               │  │                                        │ │
│                               │  │  ── In-Call Actions ──────────────── │  │ │
│                               │  │                                        │ │
│                               │  │  ┌─────────┐  ┌───────────────────┐   │ │
│                               │  │  │ ✋ Raise  │  │ 🤚 Lower Hand     │   │ │
│                               │  │  │   Hand   │  │                   │   │ │
│                               │  │  └─────────┘  └───────────────────┘   │ │
│                               │  │                                        │ │
│                               │  │  🎤 Speak                              │ │
│                               │  │  ┌──────────────────────────────────┐  │ │
│                               │  │  │ Select question...           ▾  │  │ │
│                               │  │  └──────────────────────────────────┘  │ │
│                               │  │  ┌──────────────────────────────────┐  │ │
│                               │  │  │ Or type custom text...          │  │ │
│                               │  │  └──────────────────────────────────┘  │ │
│                               │  │  [🔊 Speak Now]                        │ │
│                               │  │                                        │ │
│                               │  │  ── Post-Meeting ──────────────────  │ │
│                               │  │  [📥 Download Transcript]              │ │
│                               │  │                                        │ │
│                               │  └────────────────────────────────────────┘ │
│                               │                                             │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

### 2.2 Layout Grid

Two-column layout with a fixed header:

```
┌───────────────────────────────────────────────────────────┐
│ Header (56px, fixed)                                      │
├──────────────────────┬────────────────────────────────────┤
│                      │                                    │
│  Left Panel (420px)  │  Right Panel (flex: 1)             │
│  scrolls             │                                    │
│  independently       │  ┌────────────────────────────┐   │
│                      │  │ Transcript (flex: 1, scroll)│   │
│  • Paper upload      │  └────────────────────────────┘   │
│  • Questions list    │  ┌────────────────────────────┐   │
│  • Context editor    │  │ Status (auto height)       │   │
│                      │  └────────────────────────────┘   │
│                      │  ┌────────────────────────────┐   │
│                      │  │ Meeting Control (auto)     │   │
│                      │  └────────────────────────────┘   │
│                      │                                    │
└──────────────────────┴────────────────────────────────────┘
```

### 2.3 Settings Modal

```
┌──────────────────────────────────────────────────┐
│  ⚙️ Settings                              [✕]    │
├──────────────────────────────────────────────────┤
│                                                  │
│  Server URL                                      │
│  ┌────────────────────────────────────────────┐  │
│  │ http://54.83.242.0:3000                    │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  TTS Voice                                       │
│  ┌────────────────────────────────────────────┐  │
│  │ Rachel                                  ▾  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Personality Style                               │
│  ┌────────────────────────────────────────────┐  │
│  │ Professional                            ▾  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Max Questions                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ 5                                          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─────────────┐                                 │
│  │ Save & Close│                                 │
│  └─────────────┘                                 │
└──────────────────────────────────────────────────┘
```

### 2.4 Question Edit Modal

```
┌──────────────────────────────────────────────────┐
│  Edit Question                            [✕]    │
├──────────────────────────────────────────────────┤
│                                                  │
│  Question Text                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ How did you control for selection bias in  │  │
│  │ the cohort study?                          │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Rationale (optional)                            │
│  ┌────────────────────────────────────────────┐  │
│  │ The paper mentions observational data but  │  │
│  │ doesn't discuss propensity matching...     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Priority                                        │
│  ○ 1 (High)  ○ 2  ● 3  ○ 4  ○ 5 (Low)          │
│                                                  │
│  ┌────────┐  ┌────────┐                          │
│  │ Cancel │  │  Save  │                          │
│  └────────┘  └────────┘                          │
└──────────────────────────────────────────────────┘
```

---

## 3. Component Tree

```
<App>
├── <Header>
│   ├── Logo + title ("KIRA — AI Meeting Bot Control")
│   ├── <ConnectionIndicator>  ← WS connected/disconnected dot
│   └── <SettingsButton> → opens <SettingsModal>
│
├── <MainLayout>                ← CSS Grid: 2 columns
│   │
│   ├── <LeftPanel>             ← scrollable column
│   │   ├── <PaperSection>
│   │   │   ├── <PaperUpload>
│   │   │   │   ├── <FileDropZone>       ← drag-and-drop + click to upload
│   │   │   │   └── <TextPasteToggle>    ← expandable textarea for pasting
│   │   │   └── <PaperPreview>
│   │   │       ├── filename + size
│   │   │       └── <SummaryAccordion>   ← expandable summary text
│   │   │
│   │   ├── <QuestionsSection>
│   │   │   ├── <GenerateButton>         ← "Generate Questions" (calls /api/papers/analyze)
│   │   │   ├── <QuestionList>
│   │   │   │   └── <QuestionItem> × N   ← draggable for reorder
│   │   │   │       ├── drag handle (⠿)
│   │   │   │       ├── question text
│   │   │   │       ├── rationale (collapsed by default)
│   │   │   │       ├── status badge (ready / raised / asked)
│   │   │   │       ├── radio select (●/○) for "active question"
│   │   │   │       └── [Edit] [Delete] buttons
│   │   │   └── <AddQuestionButton>
│   │   │
│   │   └── <ContextSection>
│   │       ├── <SystemPromptEditor>     ← textarea with current system prompt
│   │       └── <SaveContextButton>
│   │
│   └── <RightPanel>            ← flex column
│       ├── <TranscriptPanel>   ← flex: 1, scrollable
│       │   ├── <TranscriptHeader>
│       │   │   ├── "Live Transcript"
│       │   │   ├── segment count
│       │   │   └── <AutoScrollToggle>
│       │   └── <TranscriptFeed>
│       │       └── <TranscriptSegment> × N
│       │           ├── timestamp
│       │           ├── speaker name (colored)
│       │           ├── text
│       │           └── [Q&A detected] badge (when applicable)
│       │
│       ├── <StatusPanel>
│       │   ├── <StatusRow> × N  (Bot, HeyGen, Transcript, Session state)
│       │   │   ├── indicator dot (●) — green/yellow/red/grey
│       │   │   └── label + value
│       │   └── <MetricsRow>
│       │       ├── Duration (mm:ss, live counter)
│       │       ├── Segments count
│       │       └── Questions asked (n/total)
│       │
│       └── <MeetingControlPanel>
│           ├── <MeetingConfig>
│           │   ├── <ZoomUrlInput>
│           │   └── <BotNameInput>
│           ├── <JoinLeaveButtons>
│           │   ├── <JoinButton>    ← disabled when in call
│           │   └── <LeaveButton>   ← disabled when not in call
│           ├── <InCallActions>     ← disabled when not LISTENING/HAND_RAISED
│           │   ├── <RaiseHandButton>
│           │   ├── <LowerHandButton>
│           │   └── <SpeakControl>
│           │       ├── <QuestionDropdown>   ← select from prepared questions
│           │       ├── <CustomTextInput>     ← or type custom text
│           │       └── <SpeakButton>
│           └── <PostMeeting>
│               └── <DownloadTranscriptButton>
│
├── <SettingsModal>             ← overlay modal
│   ├── Server URL
│   ├── TTS Voice selector
│   ├── Personality Style selector
│   └── Max Questions
│
└── <QuestionEditModal>         ← overlay modal
    ├── Question text textarea
    ├── Rationale textarea
    └── Priority selector
```

### Component count: ~30 components

The hierarchy is flat by design — most components are direct children of their panel. No deep nesting, no complex routing.

---

## 4. State Management

### 4.1 Approach: React Context + useReducer

No Redux, no Zustand. The app is small enough that a single context with a reducer handles all state. WebSocket events dispatch actions into the same reducer.

### 4.2 State Shape

```typescript
interface DashboardState {
  // ── Connection ──
  wsConnected: boolean;
  serverUrl: string;               // default: window.location.origin

  // ── Session ──
  session: Session | null;         // current active session (only one at a time)
  sessionState: SessionState;      // FSM state: IDLE → PREPARING → JOINING → LISTENING → ...

  // ── Paper ──
  paper: {
    file: File | null;             // uploaded file reference
    fileName: string | null;
    text: string | null;           // extracted text (from server response)
    summary: string | null;        // LLM-generated summary
    isUploading: boolean;
    isAnalyzing: boolean;
  };

  // ── Questions ──
  questions: Question[];           // from server + locally edited
  selectedQuestionId: string | null; // which question is "active" for speaking
  isGenerating: boolean;

  // ── Transcript ──
  transcript: TranscriptSegment[]; // full meeting transcript
  autoScroll: boolean;             // auto-scroll to bottom on new segments

  // ── Meeting ──
  meeting: {
    zoomUrl: string;
    botName: string;
    isJoining: boolean;            // POST /sessions in flight
    isLeaving: boolean;            // POST /leave in flight
    joinedAt: number | null;       // timestamp when bot entered call
  };

  // ── In-Call ──
  controls: {
    isRaisingHand: boolean;        // API call in flight
    isSpeaking: boolean;           // API call in flight
    customSpeakText: string;       // text in the custom speak input
  };

  // ── Status ──
  status: {
    bot: 'disconnected' | 'joining' | 'waiting_room' | 'in_call' | 'recording' | 'left';
    heygen: 'disconnected' | 'connecting' | 'connected' | 'error';
    transcript: 'idle' | 'streaming' | 'error';
  };

  // ── Settings ──
  settings: {
    ttsVoice: string;
    personalityStyle: PersonalityStyle;
    maxQuestions: number;
    systemPrompt: string;
  };

  // ── UI ──
  modals: {
    settings: boolean;
    editQuestion: string | null;   // question ID being edited, or null
  };

  // ── Errors ──
  errors: Array<{
    id: string;
    message: string;
    timestamp: number;
    dismissed: boolean;
  }>;
}
```

### 4.3 Reducer Actions

```typescript
type DashboardAction =
  // Connection
  | { type: 'WS_CONNECTED' }
  | { type: 'WS_DISCONNECTED' }

  // Session
  | { type: 'SESSION_CREATED'; session: Session }
  | { type: 'SESSION_UPDATED'; session: Partial<Session> }
  | { type: 'SESSION_CLEARED' }
  | { type: 'STATE_CHANGED'; state: SessionState }

  // Paper
  | { type: 'PAPER_FILE_SELECTED'; file: File }
  | { type: 'PAPER_TEXT_PASTED'; text: string }
  | { type: 'PAPER_UPLOAD_START' }
  | { type: 'PAPER_UPLOAD_SUCCESS'; text: string }
  | { type: 'PAPER_UPLOAD_ERROR'; error: string }
  | { type: 'PAPER_ANALYZED'; summary: string; questions: Question[] }
  | { type: 'PAPER_CLEARED' }

  // Questions
  | { type: 'QUESTIONS_GENERATING' }
  | { type: 'QUESTIONS_GENERATED'; questions: Question[] }
  | { type: 'QUESTION_UPDATED'; id: string; updates: Partial<Question> }
  | { type: 'QUESTION_DELETED'; id: string }
  | { type: 'QUESTION_ADDED'; question: Question }
  | { type: 'QUESTIONS_REORDERED'; questionIds: string[] }
  | { type: 'QUESTION_SELECTED'; id: string | null }

  // Transcript (from WebSocket)
  | { type: 'TRANSCRIPT_SEGMENT'; segment: TranscriptSegment }
  | { type: 'TRANSCRIPT_CLEARED' }
  | { type: 'AUTO_SCROLL_TOGGLED' }

  // Meeting
  | { type: 'ZOOM_URL_CHANGED'; url: string }
  | { type: 'BOT_NAME_CHANGED'; name: string }
  | { type: 'JOIN_START' }
  | { type: 'JOIN_SUCCESS'; session: Session }
  | { type: 'JOIN_ERROR'; error: string }
  | { type: 'LEAVE_START' }
  | { type: 'LEAVE_SUCCESS' }
  | { type: 'LEAVE_ERROR'; error: string }

  // In-call controls
  | { type: 'RAISE_HAND_START' }
  | { type: 'RAISE_HAND_SUCCESS' }
  | { type: 'RAISE_HAND_ERROR'; error: string }
  | { type: 'LOWER_HAND_START' }
  | { type: 'LOWER_HAND_SUCCESS' }
  | { type: 'SPEAK_START' }
  | { type: 'SPEAK_SUCCESS'; text: string }
  | { type: 'SPEAK_ERROR'; error: string }
  | { type: 'CUSTOM_TEXT_CHANGED'; text: string }

  // Status (from WebSocket)
  | { type: 'BOT_STATUS_CHANGED'; status: string }
  | { type: 'HEYGEN_STATUS_CHANGED'; status: string }
  | { type: 'QA_DETECTED'; confidence: number; trigger: string }

  // Settings
  | { type: 'SETTINGS_CHANGED'; settings: Partial<DashboardState['settings']> }

  // Modals
  | { type: 'MODAL_OPENED'; modal: 'settings' | 'editQuestion'; data?: string }
  | { type: 'MODAL_CLOSED'; modal: 'settings' | 'editQuestion' }

  // Errors
  | { type: 'ERROR_ADDED'; message: string }
  | { type: 'ERROR_DISMISSED'; id: string };
```

### 4.4 Where State Lives

| State | Location | Reason |
|-------|----------|--------|
| Session, questions, transcript | `DashboardContext` (reducer) | Core app state, shared across panels |
| WebSocket connection | `useWebSocket` hook → dispatches into reducer | Side-effect with reconnect logic |
| Form values (Zoom URL, custom text) | `DashboardContext` (reducer) | Needed by multiple components |
| Drag state (question reorder) | Local `QuestionList` state | Only used during drag interaction |
| Modal open/closed | `DashboardContext` (reducer) | Multiple triggers (button, keyboard) |
| Auto-scroll toggle | `DashboardContext` (reducer) | Persists across transcript updates |
| File upload preview | Local `PaperUpload` state | Not needed outside the component |
| Settings | `DashboardContext` + `localStorage` | Persists across sessions |
| Timer (meeting duration) | `useMeetingTimer` hook | Derived from `joinedAt` timestamp |

### 4.5 Data Flow

```
User Action → Component → dispatch(action) → reducer → new state → re-render
                    ↕
              API call (fetch)
                    ↕
              Server response → dispatch(success/error action)

WebSocket event → useWebSocket hook → dispatch(action) → reducer → re-render
```

---

## 5. API Contract

### 5.1 Existing Endpoints (no changes needed)

These endpoints already exist in the server and work as-is:

#### `GET /api/health`

```
Response 200:
{
  "status": "ok",
  "timestamp": "2026-04-04T09:00:00.000Z"
}
```

#### `GET /api/sessions`

```
Response 200: Session[]
[
  {
    "id": "uuid",
    "state": "LISTENING",
    "botId": "recall_bot_id",
    "meetingUrl": "https://zoom.us/j/...",
    "botName": "Kira (AI Principal SA)",
    "questions": [...],
    "transcript": [...],
    "paper": { "summary": "...", "rawText": "..." },
    "config": { ... },
    "createdAt": "2026-04-04T09:00:00.000Z",
    "handRaisedAt": null,
    "spokeAt": null
  }
]
```

#### `GET /api/sessions/:id`

```
Response 200: Session (same shape as above)
Response 404: { "error": "Session not found: <id>" }
```

#### `POST /api/sessions`

```
Request:
{
  "meetingUrl": "https://zoom.us/j/123456789?pwd=abc",
  "botName": "Kira (AI Principal SA)",        // optional, defaults to config
  "paperText": "Full text of the paper...",    // optional
  "config": {                                  // optional
    "ttsVoice": "Rachel",
    "maxQuestions": 5,
    "personality": {
      "name": "Kira",
      "style": "professional",
      "introPhrase": "Hi, I'm Kira, your Amazonian AI. I have a question about"
    },
    "systemPrompt": "You are Kira..."
  }
}

Response 201: Session
Response 400: { "error": "meetingUrl is required" }
Response 502: { "error": "Failed to create bot: ...", "session": Session }
```

#### `DELETE /api/sessions/:id`

```
Response 204: (no body)
Response 404: { "error": "Session not found: <id>" }
```

#### `POST /api/sessions/:id/raise-hand`

```
Request: {} (empty body OK)

Response 200:
{
  "state": "HAND_RAISED",
  "message": "Hand raised",
  "topQuestion": "How did you control for selection bias..." | null
}
```

#### `POST /api/sessions/:id/speak`

```
Request:
{
  "questionId": "q1",                  // OR
  "text": "Custom text to speak",      // one of these
  "refineFromTranscript": true         // optional, default false
}

Response 200:
{
  "state": "SPEAKING",
  "text": "Hi, I'm Kira... How did you control for selection bias...",
  "audioDurationMs": 4200
}
```

#### `POST /api/sessions/:id/lower-hand`

```
Request: {} (empty body)

Response 200:
{
  "state": "LISTENING",
  "message": "Hand lowered"
}
```

#### `POST /api/sessions/:id/send-chat`

```
Request:
{
  "message": "Thank you for the presentation!"
}

Response 200:
{
  "sent": true,
  "message": "Thank you for the presentation!"
}
```

#### `POST /api/sessions/:id/leave`

```
Response 200:
{
  "state": "DONE",
  "message": "Left meeting"
}
```

#### `POST /api/avatar/speak`

```
Request:
{
  "text": "Text for HeyGen to speak",
  "mode": "message"                    // "message" | "interrupt"
}

Response 200:
{
  "status": "sent",
  "connectedClients": 1
}
```

#### `POST /api/avatar/raise-hand`

```
Request:
{
  "botId": "recall_bot_id",           // optional
  "message": "✋ Kira would like to ask a question"  // optional
}

Response 200:
{
  "status": "hand_raised"
}
```

#### `POST /api/avatar/lower-hand`

```
Response 200:
{
  "status": "hand_lowered"
}
```

### 5.2 New Endpoints (to be added to server)

#### `POST /api/papers/analyze`

Analyze paper text without creating a session. Returns summary + questions.

```
Request (JSON):
{
  "text": "Full paper text...",
  "maxQuestions": 5,                   // optional, default 5
  "personality": {                     // optional
    "style": "professional"
  },
  "systemPrompt": "..."               // optional
}

OR Request (multipart/form-data):
  file: <PDF or DOCX file>
  maxQuestions: 5
  personalityStyle: "professional"

Response 200:
{
  "summary": "This paper presents a longitudinal study of...",
  "questions": [
    {
      "id": "q1",
      "text": "How did you control for selection bias in the cohort study?",
      "rationale": "The paper mentions observational data but doesn't discuss propensity matching.",
      "priority": 1,
      "status": "ready"
    },
    {
      "id": "q2",
      "text": "What was the sample size justification?",
      "rationale": "The 200-participant threshold seems arbitrary given the effect sizes reported.",
      "priority": 2,
      "status": "ready"
    }
  ]
}

Response 400: { "error": "No text or file provided" }
Response 500: { "error": "Paper analysis failed: ..." }
```

**Server implementation notes:**
- Use existing `extractTextFromBuffer()` for file uploads
- Use existing `llm.analyzePaper()` for question generation
- Add `multer` middleware for multipart file upload

#### `PATCH /api/sessions/:id/questions`

Update questions for an existing session (reorder, edit, delete, add).

```
Request:
{
  "questions": [
    {
      "id": "q2",
      "text": "Updated question text",
      "rationale": "Updated rationale",
      "priority": 1,
      "status": "ready"
    },
    {
      "id": "q1",
      "text": "How did you control for selection bias?",
      "rationale": "...",
      "priority": 2,
      "status": "ready"
    },
    {
      "id": "q_new_1",
      "text": "Brand new custom question",
      "rationale": "Operator added this manually",
      "priority": 3,
      "status": "ready"
    }
  ]
}

Response 200:
{
  "questions": [...] // the full updated question list as saved
}

Response 404: { "error": "Session not found: <id>" }
```

**Server implementation notes:**
- Replace the session's entire `questions` array with the provided one
- Validate that no "asked" question has its text changed (warn only, don't block)

#### `GET /api/config/defaults`

Returns the server's default configuration. Used to pre-populate the dashboard settings.

```
Response 200:
{
  "defaultBotName": "Kira (AI Principal SA)",
  "defaultTtsVoice": "Rachel",
  "defaultSystemPrompt": "You are Kira, an AI Principal Solutions Architect...",
  "availableVoices": ["Rachel", "Domi", "Bella", "Antoni", "Elli", "Josh", "Arnold", "Adam", "Sam"],
  "availableStyles": ["academic", "casual", "provocative", "professional"],
  "personality": {
    "name": "Kira",
    "style": "professional",
    "introPhrase": "Hi, I'm Kira, your Amazonian AI. I have a question about"
  }
}
```

#### `GET /api/sessions/:id/transcript`

Download the full transcript as a text file.

```
Response 200 (Content-Type: text/plain, Content-Disposition: attachment):

Meeting Transcript — Kira (AI Principal SA)
Date: 2026-04-04
Meeting: https://zoom.us/j/123456789
Duration: 45:12
Segments: 127

────────────────────────────────────────

[09:14:22] Dr. Smith:
And that concludes our findings on the cohort study. We found a statistically
significant correlation between cloud migration timing and operational efficiency.

[09:14:35] Moderator:
Thank you Dr. Smith. Do we have any questions?

[09:14:41] Kira (AI Principal SA):
Hi, I'm Kira, your Amazonian AI. I have a question about how you controlled
for selection bias in the cohort study.

...
```

---

## 6. WebSocket Events

### 6.1 Connection

The dashboard connects to `ws://<server>/ws/dashboard`.

> **New endpoint.** Currently the server only has `/ws/sessions/:id` (for avatar client) and `/ws/recall` (for Recall.ai transcript push). The dashboard needs a new endpoint that receives ALL events regardless of session ID — because the dashboard may be open before a session exists.

**Alternative (simpler, recommended for MVP):** Use the existing `/ws/sessions/:id` endpoint. The dashboard connects AFTER creating a session. Before a session exists, the dashboard operates in HTTP-only mode and polls `/api/sessions` periodically (every 5s) for any active sessions.

**Reconnection strategy:**
- On disconnect: attempt reconnect after 1s, 2s, 4s, 8s, 16s, 30s (exponential backoff, max 30s)
- Show connection status indicator in header
- On reconnect: fetch full session state via `GET /api/sessions/:id` to resync

### 6.2 Server → Dashboard Events

These events are pushed from the server to the dashboard via WebSocket:

#### `state_change` — Session FSM transition

```json
{
  "type": "state_change",
  "state": "LISTENING"
}
```

States: `IDLE`, `PREPARING`, `JOINING`, `LISTENING`, `HAND_RAISED`, `SPEAKING`, `LEAVING`, `DONE`

#### `transcript` — New finalized transcript segment

```json
{
  "type": "transcript",
  "speaker": "Dr. Smith",
  "text": "And that concludes our findings on the cohort study.",
  "timestamp": 1712203262000
}
```

**Note:** Only finalized segments (from `transcript.data` events). Partial segments (`transcript.partial_data`) are intentionally excluded to avoid flickering text in the UI.

#### `transcript_partial` — Partial/in-progress transcript (optional, Phase 2)

```json
{
  "type": "transcript_partial",
  "speaker": "Dr. Smith",
  "text": "And that concludes our find",
  "timestamp": 1712203262000
}
```

If implemented, the UI shows this as a greyed-out, italicized line that gets replaced by the finalized version.

#### `qa_detected` — Q&A session detected in transcript

```json
{
  "type": "qa_detected",
  "confidence": 0.85,
  "trigger": "any questions"
}
```

The dashboard shows a brief notification/badge on the transcript entry that triggered it. If `autoRaiseHand` is off, shows a prominent "Q&A Detected! Raise hand?" prompt.

#### `bot_status` — Raw bot status from Recall.ai

```json
{
  "type": "bot_status",
  "status": "in_call_recording",
  "raw": { ... }
}
```

Status values (from Recall.ai `status_changes`):
- `ready` — bot created, not yet joining
- `joining_call` — bot is joining the Zoom meeting
- `in_waiting_room` — bot is in Zoom waiting room (needs host admission)
- `in_call_not_recording` — in call, not yet recording
- `in_call_recording` — in call, recording + transcribing
- `call_ended` — call ended
- `done` — bot removed

#### `heygen_status` — HeyGen LiveAvatar connection status

```json
{
  "type": "heygen_status",
  "status": "connected",
  "avatarState": "idle"
}
```

Statuses: `disconnected`, `connecting`, `connected`, `error`
Avatar states: `idle`, `speaking`, `listening`

#### `error` — Server-side error

```json
{
  "type": "error",
  "message": "WebSocket connection to Recall.ai dropped",
  "recoverable": true
}
```

#### `speaking_complete` — Bot finished speaking

```json
{
  "type": "speaking_complete",
  "text": "Hi, I'm Kira... How did you control for selection bias...",
  "durationMs": 4200
}
```

### 6.3 Dashboard → Server Events (via WebSocket)

For MVP, the dashboard sends commands via HTTP (REST endpoints). WebSocket is server→client only.

**Phase 2 optimization:** Add bidirectional WS commands:
```json
{ "type": "cmd:raise-hand", "sessionId": "..." }
{ "type": "cmd:speak", "sessionId": "...", "questionId": "q1" }
{ "type": "cmd:lower-hand", "sessionId": "..." }
```

### 6.4 New Server-Side Changes for WebSocket

The existing `server/index.ts` needs a new upgrade handler for `/ws/dashboard`:

```typescript
// In server.on("upgrade", ...)
if (url.pathname === "/ws/dashboard") {
  dashboardWss.handleUpgrade(req, socket, head, (ws) => {
    dashboardWss.emit("connection", ws);
  });
  return;
}
```

The `dashboardWss` clients receive ALL session events (transcript, state changes, status) without needing to specify a session ID upfront. The server broadcasts to both per-session clients (`/ws/sessions/:id`) and dashboard clients (`/ws/dashboard`).

---

## 7. Color Palette & Typography

### 7.1 Color Palette — Dark Theme

Based on a professional dark palette that matches the AWS/tech aesthetic.

```
┌─────────────────────────────────────────────────────┐
│ Background Layers                                    │
│                                                     │
│  bg-base      #0A0E14   ████████  Page background   │
│  bg-surface   #111822   ████████  Panel backgrounds  │
│  bg-elevated  #1A2332   ████████  Cards, inputs      │
│  bg-hover     #212D3F   ████████  Hover states       │
│  bg-active    #283A52   ████████  Active/selected    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Text                                                 │
│                                                     │
│  text-primary   #E6EDF3   ████████  Main text        │
│  text-secondary #8B949E   ████████  Labels, muted    │
│  text-tertiary  #545D68   ████████  Timestamps, help │
│  text-inverse   #0A0E14   ████████  On light buttons │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Accent Colors                                        │
│                                                     │
│  accent-blue     #58A6FF   ████████  Primary actions  │
│  accent-blue-dim #1F3D5E   ████████  Blue bg tint     │
│  accent-green    #3FB950   ████████  Success, active  │
│  accent-green-dim#1A3324   ████████  Green bg tint    │
│  accent-yellow   #D29922   ████████  Warnings, Q&A    │
│  accent-yellow-dim#3D2C10  ████████  Yellow bg tint   │
│  accent-red      #F85149   ████████  Errors, leave    │
│  accent-red-dim  #3D1518   ████████  Red bg tint      │
│  accent-purple   #BC8CFF   ████████  Avatar/HeyGen    │
│  accent-orange   #F0883E   ████████  Speaking state   │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Border & Dividers                                    │
│                                                     │
│  border-default  #21262D   ████████  Panel borders    │
│  border-muted    #161B22   ████████  Subtle dividers  │
│  border-focus    #58A6FF   ████████  Input focus ring │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 7.2 Status Indicator Colors

```
● Connected / Active / Ready       → accent-green   #3FB950
● In Progress / Joining / Loading  → accent-yellow  #D29922
● Error / Failed / Disconnected    → accent-red     #F85149
● Idle / Not Started / Disabled    → text-tertiary  #545D68
● Speaking                         → accent-orange  #F0883E
● Hand Raised                      → accent-yellow  #D29922
```

### 7.3 Typography

| Element | Font | Size | Weight | Line Height | Color |
|---------|------|------|--------|-------------|-------|
| **App title** | Inter | 18px | 600 | 1.2 | text-primary |
| **Section headers** | Inter | 14px | 600 | 1.3 | text-primary |
| **Body text** | Inter | 13px | 400 | 1.5 | text-primary |
| **Labels** | Inter | 12px | 500 | 1.3 | text-secondary |
| **Transcript speaker** | Inter | 12px | 600 | 1.3 | accent-blue |
| **Transcript text** | Inter | 13px | 400 | 1.5 | text-primary |
| **Timestamp** | JetBrains Mono | 11px | 400 | 1.3 | text-tertiary |
| **Code/mono** | JetBrains Mono | 12px | 400 | 1.5 | text-primary |
| **Button primary** | Inter | 13px | 500 | 1.0 | text-inverse |
| **Button secondary** | Inter | 13px | 500 | 1.0 | text-primary |
| **Input text** | Inter | 13px | 400 | 1.5 | text-primary |
| **Badge/status** | Inter | 11px | 500 | 1.0 | varies |

**Font loading:** Import from Google Fonts:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap');
```

### 7.4 Component Styling

**Buttons:**
```css
/* Primary (Join Meeting, Speak, Generate) */
background: #58A6FF;
color: #0A0E14;
border: none;
border-radius: 6px;
padding: 8px 16px;
/* Hover: brightness(1.1) */
/* Disabled: opacity 0.4, cursor not-allowed */

/* Danger (Leave Meeting) */
background: transparent;
color: #F85149;
border: 1px solid #F85149;
/* Hover: background #3D1518 */

/* Warning (Raise Hand) */
background: #D29922;
color: #0A0E14;

/* Secondary (Edit, Delete, Lower Hand) */
background: #1A2332;
color: #E6EDF3;
border: 1px solid #21262D;
/* Hover: background #212D3F */
```

**Panels:**
```css
background: #111822;
border: 1px solid #21262D;
border-radius: 8px;
padding: 16px;
```

**Inputs:**
```css
background: #1A2332;
color: #E6EDF3;
border: 1px solid #21262D;
border-radius: 6px;
padding: 8px 12px;
/* Focus: border-color #58A6FF, box-shadow 0 0 0 2px rgba(88,166,255,0.2) */
```

**Scrollbars (WebKit):**
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #21262D; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #545D68; }
```

---

## 8. User Flows

### 8.1 Flow: Open Dashboard → Meeting Complete

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  1. OPEN DASHBOARD                                               │
 │  ─────────────────                                               │
 │  Operator navigates to http://54.83.242.0:3000/dashboard         │
 │  → Dashboard loads, connects WebSocket                           │
 │  → Checks for existing active session (GET /api/sessions)        │
 │  → If active session found: resume (jump to step 6)              │
 │  → If no session: show empty state                               │
 │                                                                  │
 │  2. UPLOAD PAPER                                                 │
 │  ──────────────                                                  │
 │  Operator drags PDF into the drop zone (or clicks to browse,     │
 │  or expands "paste text" and pastes content)                     │
 │  → File appears in drop zone: "research.pdf (2.4 MB) ✓"         │
 │  → Text is extracted client-side (displayed) or server-side      │
 │  → Paper section shows file name and "Ready to analyze"          │
 │                                                                  │
 │  3. GENERATE QUESTIONS                                           │
 │  ─────────────────────                                           │
 │  Operator clicks [Generate Questions]                            │
 │  → Button shows spinner: "Analyzing paper..."                    │
 │  → POST /api/papers/analyze { text, maxQuestions }               │
 │  → Wait 5-15 seconds (Claude processes paper)                    │
 │  → Questions appear in the list with rationale                   │
 │  → Summary appears in paper preview section                      │
 │  → Operator can: edit, delete, reorder, add custom questions     │
 │                                                                  │
 │  4. EDIT CONTEXT (optional)                                      │
 │  ──────────────────────────                                      │
 │  Operator scrolls to Context section                             │
 │  → System prompt textarea shows current prompt                   │
 │  → Edit as needed, click [Save Context]                          │
 │                                                                  │
 │  5. CONFIGURE & JOIN MEETING                                     │
 │  ───────────────────────────                                     │
 │  Operator pastes Zoom URL into the input field                   │
 │  Optionally changes bot name                                     │
 │  Clicks [🚀 Join Meeting]                                        │
 │  → Button shows spinner: "Creating bot..."                       │
 │  → POST /api/sessions { meetingUrl, botName, paperText, config } │
 │  → Session created → WebSocket connected for session             │
 │  → Status: Bot: ● Joining...                                     │
 │                                                                  │
 │  6. WAITING ROOM                                                 │
 │  ──────────────                                                  │
 │  → Status: Bot: ● In Waiting Room                                │
 │  → Dashboard shows: "Bot is in the waiting room. Ask the host    │
 │    to admit Kira."                                               │
 │  → Host admits bot from Zoom                                     │
 │                                                                  │
 │  7. IN CALL — LISTENING                                          │
 │  ──────────────────────                                          │
 │  → Status: Bot: ● In Call (recording)                            │
 │  → Status: HeyGen: ● Connected (if avatar initialized)          │
 │  → Status: Transcript: ● Streaming                               │
 │  → Transcript panel starts filling with speaker segments          │
 │  → Duration counter starts (00:00 → ...)                         │
 │  → In-call action buttons become enabled                         │
 │                                                                  │
 │  8. RAISE HAND (operator-triggered)                              │
 │  ──────────────────────────────────                              │
 │  Operator clicks [✋ Raise Hand]                                  │
 │  → POST /api/sessions/:id/raise-hand (OR /api/avatar/raise-hand)│
 │  → Chat message sent to Zoom: "✋ Kira would like to ask..."     │
 │  → Avatar shows ✋ overlay in meeting                             │
 │  → Status: Session: ● HAND_RAISED                                │
 │  → TTS pre-generates audio for top question in background        │
 │  → [Lower Hand] button becomes active                            │
 │                                                                  │
 │  8b. RAISE HAND (auto-detected)                                  │
 │  ────────────────────────────────                                │
 │  → Q&A detected in transcript (highlighted with badge)           │
 │  → If autoRaiseHand enabled: same as step 8                      │
 │  → If manual: notification: "Q&A detected! Raise hand?"          │
 │                                                                  │
 │  9. SPEAK                                                        │
 │  ──────                                                          │
 │  Operator selects question from dropdown (or types custom text)  │
 │  Clicks [🔊 Speak Now]                                           │
 │  → POST /api/sessions/:id/speak { questionId | text }            │
 │  → Status: Session: ● SPEAKING                                   │
 │  → Avatar speaks in meeting (HeyGen lip sync + audio)            │
 │  → After speech: auto-transitions back to LISTENING              │
 │  → Question marked as "asked" in the list (badge changes)        │
 │                                                                  │
 │  10. CONTINUE LISTENING                                          │
 │  ──────────────────────                                          │
 │  → Operator can raise hand again for next question               │
 │  → Or type custom follow-up text and speak                       │
 │  → Repeat steps 8-10 as needed                                   │
 │                                                                  │
 │  11. LEAVE MEETING                                               │
 │  ─────────────────                                               │
 │  Operator clicks [🚪 Leave Meeting]                               │
 │  → Confirmation: "Leave the meeting? This will disconnect Kira." │
 │  → POST /api/sessions/:id/leave                                  │
 │  → Status: Session: ● DONE                                       │
 │  → In-call actions disabled                                      │
 │  → [📥 Download Transcript] button appears / becomes prominent   │
 │                                                                  │
 │  12. POST-MEETING                                                │
 │  ────────────────                                                │
 │  Operator clicks [📥 Download Transcript]                         │
 │  → GET /api/sessions/:id/transcript                              │
 │  → Browser downloads a .txt file with the full transcript        │
 │  → Dashboard stays open showing the final state                  │
 │  → Operator can start a new session (panel resets)               │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

### 8.2 Flow: Resume Active Session

```
Operator opens dashboard → GET /api/sessions returns active session
→ Dashboard auto-loads session state (questions, transcript, status)
→ Connects WebSocket for that session
→ Resumes wherever the meeting left off
```

### 8.3 Flow: Edit Question

```
Operator clicks [Edit] on a question
→ QuestionEditModal opens with pre-filled text, rationale, priority
→ Operator edits fields
→ Clicks [Save]
→ PATCH /api/sessions/:id/questions (full list with edit applied)
→ Modal closes, question list updates
```

### 8.4 Flow: Add Custom Question

```
Operator clicks [+ Add Question]
→ QuestionEditModal opens with empty fields
→ Operator types question and optional rationale
→ Clicks [Save]
→ New question added to local list
→ If session exists: PATCH /api/sessions/:id/questions
```

### 8.5 Error States

| Error | User Sees | Recovery |
|-------|-----------|----------|
| WebSocket disconnected | Red dot in header, "Reconnecting..." toast | Auto-reconnect with backoff |
| Bot creation fails (502) | Error toast: "Failed to create bot: ..." | Fix Zoom URL, retry |
| Bot in waiting room too long (>5min) | Warning: "Still in waiting room..." | Operator asks host to admit |
| HeyGen credits depleted | Status: HeyGen: ● Error | Toast: "HeyGen credits exhausted" |
| Paper analysis fails | Error toast below Generate button | Retry or enter questions manually |
| Speak fails (no bot) | Error toast | Re-join meeting |
| Server unreachable | Full-page overlay: "Cannot reach server" | Check server, retry |

---

## 9. File Structure

```
dashboard/
├── index.html                          # Vite entry HTML
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── postcss.config.js                   # If using Tailwind (optional)
│
├── public/
│   └── favicon.svg                     # Kira icon
│
└── src/
    ├── main.tsx                         # React entry point
    ├── App.tsx                          # Root component: Header + MainLayout
    ├── types.ts                         # Shared TypeScript interfaces
    │                                    # (mirrors server/types.ts where needed)
    │
    ├── context/
    │   ├── DashboardContext.tsx          # React Context + Provider
    │   ├── dashboardReducer.ts          # State reducer (all actions)
    │   └── initialState.ts              # Default state values
    │
    ├── hooks/
    │   ├── useWebSocket.ts              # WS connection + reconnect + dispatch
    │   ├── useApi.ts                    # HTTP client wrapper (base URL, error handling)
    │   ├── useMeetingTimer.ts           # Live duration counter from joinedAt
    │   └── useLocalStorage.ts           # Persist settings to localStorage
    │
    ├── api/
    │   └── client.ts                    # All API calls as typed async functions
    │                                    # e.g. createSession(), analyzesPaper(), raiseHand()
    │
    ├── components/
    │   ├── Header/
    │   │   ├── Header.tsx
    │   │   ├── ConnectionIndicator.tsx
    │   │   └── Header.css
    │   │
    │   ├── LeftPanel/
    │   │   ├── LeftPanel.tsx
    │   │   ├── PaperSection/
    │   │   │   ├── PaperSection.tsx
    │   │   │   ├── PaperUpload.tsx       # Drag-drop + paste toggle
    │   │   │   ├── FileDropZone.tsx
    │   │   │   ├── PaperPreview.tsx       # File name, summary accordion
    │   │   │   └── PaperSection.css
    │   │   │
    │   │   ├── QuestionsSection/
    │   │   │   ├── QuestionsSection.tsx
    │   │   │   ├── QuestionList.tsx        # Draggable list container
    │   │   │   ├── QuestionItem.tsx        # Single question row
    │   │   │   ├── GenerateButton.tsx
    │   │   │   ├── AddQuestionButton.tsx
    │   │   │   └── QuestionsSection.css
    │   │   │
    │   │   └── ContextSection/
    │   │       ├── ContextSection.tsx
    │   │       ├── SystemPromptEditor.tsx
    │   │       └── ContextSection.css
    │   │
    │   ├── RightPanel/
    │   │   ├── RightPanel.tsx
    │   │   │
    │   │   ├── TranscriptPanel/
    │   │   │   ├── TranscriptPanel.tsx
    │   │   │   ├── TranscriptFeed.tsx     # Scrollable list of segments
    │   │   │   ├── TranscriptSegment.tsx  # Single transcript entry
    │   │   │   └── TranscriptPanel.css
    │   │   │
    │   │   ├── StatusPanel/
    │   │   │   ├── StatusPanel.tsx
    │   │   │   ├── StatusRow.tsx          # Single status indicator row
    │   │   │   └── StatusPanel.css
    │   │   │
    │   │   └── MeetingControl/
    │   │       ├── MeetingControlPanel.tsx
    │   │       ├── MeetingConfig.tsx       # Zoom URL + Bot Name inputs
    │   │       ├── JoinLeaveButtons.tsx
    │   │       ├── InCallActions.tsx       # Raise/Lower/Speak group
    │   │       ├── SpeakControl.tsx        # Question dropdown + custom text + button
    │   │       ├── PostMeetingActions.tsx  # Download transcript
    │   │       └── MeetingControl.css
    │   │
    │   ├── Modals/
    │   │   ├── SettingsModal.tsx
    │   │   ├── QuestionEditModal.tsx
    │   │   ├── ConfirmModal.tsx           # Generic "Are you sure?" modal
    │   │   └── Modals.css
    │   │
    │   └── shared/
    │       ├── Button.tsx                 # Styled button variants
    │       ├── Input.tsx                  # Styled text input
    │       ├── Textarea.tsx              # Styled textarea
    │       ├── Select.tsx                # Styled dropdown
    │       ├── Badge.tsx                 # Status badges
    │       ├── Spinner.tsx              # Loading spinner
    │       ├── Toast.tsx                # Error/success notifications
    │       └── shared.css
    │
    └── styles/
        ├── globals.css                   # CSS reset, variables, fonts
        ├── layout.css                    # Grid layout for panels
        └── animations.css                # Pulse, slide, fade transitions
```

### Vite Config

```typescript
// dashboard/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',          // serve under /dashboard path
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,                 // different from avatar client (5173)
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
```

### Express Static Serving

Add to `server/index.ts`:

```typescript
// Serve dashboard static files (built by Vite)
app.use('/dashboard', express.static(path.join(__dirname, '../dashboard/dist')));
// SPA fallback — serve index.html for all /dashboard/* routes
app.get('/dashboard/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/dist/index.html'));
});
```

---

## 10. Implementation Phases

### Phase 1 — Skeleton + Meeting Control (Days 1-2)

**Goal:** Basic dashboard that can join/leave meetings and show status.

**Build:**
- [ ] `dashboard/` Vite project scaffolding (React + TypeScript)
- [ ] `globals.css` — CSS variables, dark theme, fonts, reset
- [ ] `layout.css` — two-column grid layout
- [ ] `Header` component with logo
- [ ] `MeetingControlPanel` — Zoom URL input, bot name, Join/Leave buttons
- [ ] `StatusPanel` — bot status, session state (hardcoded data initially)
- [ ] `api/client.ts` — `createSession()`, `leaveSession()`, `getSession()`
- [ ] Express route to serve `/dashboard` static files
- [ ] Wire up: Join → POST /api/sessions → show status
- [ ] Wire up: Leave → POST /leave → show DONE

**Server changes:**
- [ ] Add static serving for `/dashboard`
- [ ] Add `GET /api/config/defaults` endpoint

**Test:** Open dashboard → paste Zoom URL → Join → see status change → Leave.

---

### Phase 2 — WebSocket + Live Transcript (Days 3-4)

**Goal:** Real-time transcript streaming in the dashboard.

**Build:**
- [ ] `useWebSocket` hook with reconnect logic
- [ ] `DashboardContext` + `dashboardReducer` (full state management)
- [ ] `ConnectionIndicator` in header (green/red dot)
- [ ] `TranscriptPanel` with `TranscriptFeed` and `TranscriptSegment`
- [ ] Auto-scroll behavior (with toggle)
- [ ] Status indicators updated from WebSocket events
- [ ] `useMeetingTimer` hook for duration counter

**Server changes:**
- [ ] Add `/ws/dashboard` WebSocket endpoint
- [ ] Broadcast transcript + state_change + bot_status to dashboard clients
- [ ] Add `heygen_status` event when client reports HeyGen state

**Test:** Join meeting → see transcript appear in real time → see status updates.

---

### Phase 3 — In-Call Actions (Days 5-6)

**Goal:** Raise hand, speak, lower hand from the dashboard.

**Build:**
- [ ] `InCallActions` component — Raise Hand, Lower Hand buttons
- [ ] `SpeakControl` — question dropdown + custom text + Speak button
- [ ] Wire up: Raise Hand → POST /api/avatar/raise-hand (sends to both avatar + Zoom chat)
- [ ] Wire up: Lower Hand → POST /api/avatar/lower-hand
- [ ] Wire up: Speak → POST /api/avatar/speak (for HeyGen) + POST /api/sessions/:id/speak (for ElevenLabs)
- [ ] Button state management (disable when not applicable)
- [ ] Loading spinners during API calls
- [ ] Error toasts for failed actions

**Design decisions for speak:**
- Dashboard calls `/api/avatar/speak` which sends to HeyGen (avatar lip-syncs and speaks)
- Also call `/api/sessions/:id/speak` for ElevenLabs output_audio (bot audio in Zoom)
- Or: create a unified `/api/dashboard/speak` endpoint that does both

**Test:** During a live meeting → Raise Hand → see ✋ in Zoom chat → Speak → hear Kira ask question.

---

### Phase 4 — Paper Upload + Question Generation (Days 7-8)

**Goal:** Upload papers, generate and edit questions.

**Build:**
- [ ] `PaperUpload` with `FileDropZone` (drag-and-drop)
- [ ] `TextPasteToggle` (expandable textarea)
- [ ] `PaperPreview` with summary accordion
- [ ] `GenerateButton` → POST /api/papers/analyze
- [ ] `QuestionList` with `QuestionItem` components
- [ ] Question select (radio) for "active question"
- [ ] `QuestionEditModal` — edit text, rationale, priority
- [ ] `AddQuestionButton` — opens empty QuestionEditModal
- [ ] Delete question with confirmation
- [ ] Integrate questions with SpeakControl dropdown

**Server changes:**
- [ ] Add `POST /api/papers/analyze` endpoint (multipart + JSON)
- [ ] Add `multer` for file upload handling
- [ ] Add `PATCH /api/sessions/:id/questions` endpoint

**Test:** Upload PDF → Generate Questions → Edit a question → Join meeting → Speak selected question.

---

### Phase 5 — Question Reorder + Context Editor (Days 9-10)

**Goal:** Drag-to-reorder questions, edit system prompt.

**Build:**
- [ ] Drag-and-drop reorder in `QuestionList` (use `@dnd-kit/core` or native HTML drag)
- [ ] `ContextSection` with `SystemPromptEditor`
- [ ] Save context → updates session config (stored in state, sent with next session creation)
- [ ] Persist settings to localStorage (voice, style, prompt, etc.)
- [ ] `SettingsModal` — all configuration options

**Test:** Reorder questions → Create session → verify order preserved. Edit prompt → Create session → verify personality applied.

---

### Phase 6 — Polish + Post-Meeting (Days 11-12)

**Goal:** Download transcript, error handling, animations, edge cases.

**Build:**
- [ ] `PostMeetingActions` — Download Transcript button
- [ ] `GET /api/sessions/:id/transcript` endpoint (returns formatted text file)
- [ ] Error/success `Toast` notification system
- [ ] `ConfirmModal` for leave meeting
- [ ] Keyboard shortcuts:
  - `Ctrl+Enter` → Speak (when text/question selected)
  - `Ctrl+H` → Raise Hand
  - `Escape` → Close modal
- [ ] Empty states (no paper, no questions, no transcript)
- [ ] Loading skeletons for panels
- [ ] CSS animations: panel transitions, status dot pulse, toast slide-in
- [ ] Resume session on page refresh (check for active session)
- [ ] Q&A detection badge on transcript segments

**Server changes:**
- [ ] Add `GET /api/sessions/:id/transcript` endpoint (text format download)
- [ ] Add `qa_detected` WebSocket event (wire up to Q&A detector)

**Test:** Full end-to-end: Upload paper → Generate questions → Join → Watch transcript → Raise hand → Speak → Leave → Download transcript.

---

### Phase 7 — Future Enhancements (Backlog)

Not in initial build, but designed for:

- [ ] **Partial transcript** — show in-progress utterances (greyed out, italicized)
- [ ] **Q&A auto-detection** — automatic raise hand when Q&A detected
- [ ] **Session history** — list of past sessions with transcripts
- [ ] **Multi-session** — run multiple bots simultaneously
- [ ] **Audio preview** — play TTS audio before sending to meeting
- [ ] **Speaker color coding** — assign colors to different speakers in transcript
- [ ] **Transcript search** — Ctrl+F style search within transcript
- [ ] **Export as PDF** — transcript + summary as formatted PDF
- [ ] **HeyGen context editor** — edit the LiveAvatar persona context via API
- [ ] **Credits monitor** — show HeyGen credits remaining in status panel
- [ ] **Dark/light theme toggle** (low priority — dark is the default and preferred)

---

## Appendix A: API Client Code

Reference implementation for `dashboard/src/api/client.ts`:

```typescript
const BASE_URL = ''; // same origin

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, options);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Sessions ──

export function listSessions() {
  return request<Session[]>('GET', '/api/sessions');
}

export function getSession(id: string) {
  return request<Session>('GET', `/api/sessions/${id}`);
}

export function createSession(data: {
  meetingUrl: string;
  botName?: string;
  paperText?: string;
  config?: SessionConfig;
}) {
  return request<Session>('POST', '/api/sessions', data);
}

export function deleteSession(id: string) {
  return request<void>('DELETE', `/api/sessions/${id}`);
}

// ── Control ──

export function raiseHand(sessionId: string) {
  return request<{ state: string; message: string; topQuestion: string | null }>(
    'POST', `/api/sessions/${sessionId}/raise-hand`
  );
}

export function speak(sessionId: string, data: { questionId?: string; text?: string; refineFromTranscript?: boolean }) {
  return request<{ state: string; text: string; audioDurationMs: number }>(
    'POST', `/api/sessions/${sessionId}/speak`, data
  );
}

export function lowerHand(sessionId: string) {
  return request<{ state: string; message: string }>(
    'POST', `/api/sessions/${sessionId}/lower-hand`
  );
}

export function leaveSession(sessionId: string) {
  return request<{ state: string; message: string }>(
    'POST', `/api/sessions/${sessionId}/leave`
  );
}

export function sendChat(sessionId: string, message: string) {
  return request<{ sent: boolean; message: string }>(
    'POST', `/api/sessions/${sessionId}/send-chat`, { message }
  );
}

// ── Avatar ──

export function avatarSpeak(text: string, mode = 'message') {
  return request<{ status: string; connectedClients: number }>(
    'POST', '/api/avatar/speak', { text, mode }
  );
}

export function avatarRaiseHand(botId?: string) {
  return request<{ status: string }>(
    'POST', '/api/avatar/raise-hand', { botId }
  );
}

export function avatarLowerHand() {
  return request<{ status: string }>(
    'POST', '/api/avatar/lower-hand'
  );
}

// ── Paper ──

export function analyzePaper(data: { text: string; maxQuestions?: number; personality?: Personality; systemPrompt?: string }) {
  return request<{ summary: string; questions: Question[] }>(
    'POST', '/api/papers/analyze', data
  );
}

export async function analyzePaperFile(file: File, maxQuestions = 5) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('maxQuestions', String(maxQuestions));

  const res = await fetch(`${BASE_URL}/api/papers/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<{ summary: string; questions: Question[] }>;
}

// ── Questions ──

export function updateQuestions(sessionId: string, questions: Question[]) {
  return request<{ questions: Question[] }>(
    'PATCH', `/api/sessions/${sessionId}/questions`, { questions }
  );
}

// ── Config ──

export function getDefaults() {
  return request<{
    defaultBotName: string;
    defaultTtsVoice: string;
    defaultSystemPrompt: string;
    availableVoices: string[];
    availableStyles: string[];
    personality: Personality;
  }>('GET', '/api/config/defaults');
}

// ── Transcript Download ──

export async function downloadTranscript(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/transcript`);
  if (!res.ok) throw new Error('Failed to download transcript');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcript-${sessionId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
```

## Appendix B: WebSocket Hook

Reference implementation for `dashboard/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useDashboard } from '../context/DashboardContext';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export function useWebSocket(sessionId: string | null) {
  const { dispatch } = useDashboard();
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/sessions/${sessionId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      dispatch({ type: 'WS_CONNECTED' });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'state_change':
            dispatch({ type: 'STATE_CHANGED', state: msg.state });
            break;
          case 'transcript':
            dispatch({
              type: 'TRANSCRIPT_SEGMENT',
              segment: { speaker: msg.speaker, text: msg.text, timestamp: msg.timestamp ?? Date.now() },
            });
            break;
          case 'bot_status':
            dispatch({ type: 'BOT_STATUS_CHANGED', status: msg.status });
            break;
          case 'heygen_status':
            dispatch({ type: 'HEYGEN_STATUS_CHANGED', status: msg.status });
            break;
          case 'qa_detected':
            dispatch({ type: 'QA_DETECTED', confidence: msg.confidence, trigger: msg.trigger });
            break;
          case 'error':
            dispatch({ type: 'ERROR_ADDED', message: msg.message });
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      dispatch({ type: 'WS_DISCONNECTED' });
      // Reconnect with exponential backoff
      const delay = RECONNECT_DELAYS[Math.min(attemptRef.current, RECONNECT_DELAYS.length - 1)];
      attemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };
  }, [sessionId, dispatch]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
```

## Appendix C: Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.5"
  }
}
```

**No additional UI library.** The app is small enough that custom CSS handles everything. No Tailwind, no MUI, no Chakra. Just CSS variables + vanilla CSS (or CSS modules if preferred).

**Optional additions (Phase 4+):**
- `@dnd-kit/core` + `@dnd-kit/sortable` — for drag-to-reorder questions

---

## Appendix D: Unified Speak Endpoint (Recommended Server Addition)

The dashboard needs to coordinate between two speak paths:
1. **HeyGen speak** (`/api/avatar/speak`) — avatar lip-syncs the text
2. **Session speak** (`/api/sessions/:id/speak`) — ElevenLabs TTS → Recall output_audio

Create a unified endpoint so the dashboard makes ONE call:

```
POST /api/dashboard/speak
{
  "sessionId": "uuid",
  "questionId": "q1",        // or
  "text": "custom text",
  "refineFromTranscript": false,
  "speakVia": "heygen"       // "heygen" | "elevenlabs" | "both"
}

Response 200:
{
  "status": "speaking",
  "text": "Hi, I'm Kira... How did you control for selection bias...",
  "via": "heygen",
  "audioDurationMs": 4200     // only if elevenlabs
}
```

When `speakVia` is `"heygen"`:
- Send `{ type: "speak", text }` to avatar WebSocket clients
- HeyGen handles TTS + lip sync + audio output
- No need for ElevenLabs

When `speakVia` is `"elevenlabs"`:
- Generate TTS via ElevenLabs
- POST to Recall.ai output_audio
- Avatar shows speaking animation but doesn't generate voice

When `speakVia` is `"both"`:
- Both paths execute (for testing/comparison)

**Default should be `"heygen"` since the working demo uses HeyGen for all speech.**
