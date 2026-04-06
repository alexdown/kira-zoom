// ── Session State Machine ──

export type SessionState =
  | 'IDLE'
  | 'PREPARING'
  | 'JOINING'
  | 'LISTENING'
  | 'HAND_RAISED'
  | 'SPEAKING'
  | 'LEAVING'
  | 'DONE';

// ── Domain Types ──

export type QuestionStatus = 'ready' | 'raised' | 'asked' | 'skipped';

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

export type PersonalityStyle = 'academic' | 'casual' | 'provocative' | 'professional';

export interface Personality {
  name?: string;
  style?: PersonalityStyle;
  introPhrase?: string;
}

export interface SessionConfig {
  ttsVoice?: string;
  maxQuestions?: number;
  qaDetectionSensitivity?: 'low' | 'medium' | 'high';
  autoRaiseHand?: boolean;
  autoSpeak?: boolean;
  systemPrompt?: string;
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

// ── Extracted Comment ──

export interface ExtractedComment {
  id: string;
  author: string;
  date: string;
  comment: string;
  anchored_text: string;
}

// ── Dashboard State ──

export type BotStatus =
  | 'disconnected'
  | 'joining'
  | 'waiting_room'
  | 'in_call'
  | 'recording'
  | 'left';

export type HeygenStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type TranscriptStatus = 'idle' | 'streaming' | 'error';

export interface DashboardState {
  wsConnected: boolean;
  session: Session | null;

  // Paper
  paper: {
    fileName: string | null;
    text: string | null;
    summary: string | null;
    comments: ExtractedComment[];
    isExtracting: boolean;
    isAnalyzing: boolean;
  };

  // Questions
  questions: Question[];
  selectedQuestionId: string | null;

  // Transcript
  transcript: TranscriptSegment[];
  autoScroll: boolean;

  // Meeting
  meeting: {
    zoomUrl: string;
    botName: string;
    isJoining: boolean;
    isLeaving: boolean;
  };

  // In-call controls
  controls: {
    isRaisingHand: boolean;
    isLoweringHand: boolean;
    isSpeaking: boolean;
    customSpeakText: string;
  };

  // Status
  status: {
    bot: BotStatus;
    heygen: HeygenStatus;
    transcript: TranscriptStatus;
  };

  // Settings
  settings: {
    ttsVoice: string;
    personalityStyle: PersonalityStyle;
    maxQuestions: number;
    systemPrompt: string;
  };

  // UI
  modals: {
    settings: boolean;
    editQuestion: string | null;
  };

  // Errors
  errors: AppError[];
}

export interface AppError {
  id: string;
  message: string;
  timestamp: number;
  dismissed: boolean;
}

// ── Reducer Actions ──

export type DashboardAction =
  | { type: 'WS_CONNECTED' }
  | { type: 'WS_DISCONNECTED' }
  | { type: 'SESSION_LOADED'; session: Session }
  | { type: 'SESSION_CLEARED' }
  | { type: 'STATE_CHANGED'; state: SessionState }
  | { type: 'PAPER_TEXT_SET'; text: string; fileName?: string; comments?: ExtractedComment[] }
  | { type: 'PAPER_EXTRACT_START' }
  | { type: 'PAPER_EXTRACTED'; text: string; fileName: string; comments: ExtractedComment[] }
  | { type: 'PAPER_EXTRACT_ERROR'; error: string }
  | { type: 'PAPER_ANALYZE_START' }
  | { type: 'PAPER_ANALYZED'; summary: string; questions: Question[] }
  | { type: 'PAPER_ANALYZE_ERROR'; error: string }
  | { type: 'PAPER_CLEARED' }
  | { type: 'QUESTIONS_SET'; questions: Question[] }
  | { type: 'QUESTION_UPDATED'; id: string; updates: Partial<Question> }
  | { type: 'QUESTION_DELETED'; id: string }
  | { type: 'QUESTION_ADDED'; question: Question }
  | { type: 'QUESTION_SELECTED'; id: string | null }
  | { type: 'TRANSCRIPT_SEGMENT'; segment: TranscriptSegment }
  | { type: 'TRANSCRIPT_CLEARED' }
  | { type: 'AUTO_SCROLL_TOGGLED' }
  | { type: 'ZOOM_URL_CHANGED'; url: string }
  | { type: 'BOT_NAME_CHANGED'; name: string }
  | { type: 'JOIN_START' }
  | { type: 'JOIN_SUCCESS'; session: Session }
  | { type: 'JOIN_ERROR'; error: string }
  | { type: 'LEAVE_START' }
  | { type: 'LEAVE_SUCCESS' }
  | { type: 'LEAVE_ERROR'; error: string }
  | { type: 'RAISE_HAND_START' }
  | { type: 'RAISE_HAND_SUCCESS' }
  | { type: 'RAISE_HAND_ERROR'; error: string }
  | { type: 'LOWER_HAND_START' }
  | { type: 'LOWER_HAND_SUCCESS' }
  | { type: 'LOWER_HAND_ERROR'; error: string }
  | { type: 'SPEAK_START' }
  | { type: 'SPEAK_SUCCESS'; text: string }
  | { type: 'SPEAK_ERROR'; error: string }
  | { type: 'CUSTOM_TEXT_CHANGED'; text: string }
  | { type: 'BOT_STATUS_CHANGED'; status: string }
  | { type: 'HEYGEN_STATUS_CHANGED'; status: string }
  | { type: 'SETTINGS_CHANGED'; settings: Partial<DashboardState['settings']> }
  | { type: 'MODAL_OPENED'; modal: 'settings' | 'editQuestion'; data?: string }
  | { type: 'MODAL_CLOSED'; modal: 'settings' | 'editQuestion' }
  | { type: 'ERROR_ADDED'; message: string }
  | { type: 'ERROR_DISMISSED'; id: string };

// ── API Response Types ──

export interface ConfigDefaults {
  defaultBotName: string;
  defaultTtsVoice: string;
  defaultSystemPrompt: string;
  availableVoices: string[];
  availableStyles: string[];
  personality: Personality;
}
