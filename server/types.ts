// ──────────────────────────────────────────────
// Session state machine
// ──────────────────────────────────────────────

export enum SessionState {
  IDLE = "IDLE",
  PREPARING = "PREPARING",
  JOINING = "JOINING",
  LISTENING = "LISTENING",
  HAND_RAISED = "HAND_RAISED",
  SPEAKING = "SPEAKING",
  LEAVING = "LEAVING",
  DONE = "DONE",
}

// ──────────────────────────────────────────────
// Domain types
// ──────────────────────────────────────────────

export type QuestionStatus = "ready" | "raised" | "asked" | "skipped";

export interface Question {
  id: string;
  text: string;
  rationale: string;
  priority: number;
  status: QuestionStatus;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: number;
}

export interface PaperInfo {
  summary: string;
  rawText: string;
}

export type PersonalityStyle = "academic" | "casual" | "provocative" | "professional";

export interface Personality {
  /** Display name the bot uses when speaking */
  name?: string;
  /** Tone / style for generated questions */
  style?: PersonalityStyle;
  /** Opening phrase when the bot starts speaking, e.g. "Thank you — I have a question about..." */
  introPhrase?: string;
}

export interface SessionConfig {
  ttsVoice?: string;
  maxQuestions?: number;
  qaDetectionSensitivity?: "low" | "medium" | "high";
  autoRaiseHand?: boolean;
  autoSpeak?: boolean;
  /** Custom system prompt prepended to all LLM calls for this session */
  systemPrompt?: string;
  /** Bot personality settings */
  personality?: Personality;
}

export interface Session {
  id: string;
  state: SessionState;
  botId?: string;
  meetingUrl: string;
  botName: string;
  questions: Question[];
  transcript: TranscriptSegment[];
  paper?: PaperInfo;
  config: SessionConfig;
  createdAt: string;
  handRaisedAt?: string;
  spokeAt?: string;
}

// ──────────────────────────────────────────────
// Request / Response types
// ──────────────────────────────────────────────

export interface CreateSessionRequest {
  meetingUrl: string;
  botName?: string;
  paperText?: string;
  paperSummary?: string;
  questions?: Question[];
  comments?: Array<{ author: string; comment: string; anchored_text: string }>;
  config?: SessionConfig;
}

export interface RaiseHandRequest {
  questionId?: string;
  message?: string;
}

export interface SpeakRequest {
  questionId?: string;
  text?: string;
  refineFromTranscript?: boolean;
}

export interface SendChatRequest {
  message: string;
}

// ──────────────────────────────────────────────
// Recall.ai webhook event types
// ──────────────────────────────────────────────

export interface RecallWebhookEvent {
  event: string;
  data: Record<string, unknown>;
}
