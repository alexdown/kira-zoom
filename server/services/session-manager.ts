import {
  Session,
  SessionState,
  SessionConfig,
  TranscriptSegment,
} from "../types.js";
import { DEFAULT_PERSONALITY, DEFAULT_SYSTEM_PROMPT } from "../config.js";

// ──────────────────────────────────────────────
// Valid state transitions
// ──────────────────────────────────────────────

const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  [SessionState.IDLE]: [SessionState.PREPARING, SessionState.JOINING, SessionState.LEAVING],
  [SessionState.PREPARING]: [SessionState.JOINING, SessionState.LEAVING],
  [SessionState.JOINING]: [SessionState.LISTENING, SessionState.LEAVING],
  [SessionState.LISTENING]: [
    SessionState.HAND_RAISED,
    SessionState.SPEAKING,
    SessionState.LEAVING,
  ],
  [SessionState.HAND_RAISED]: [
    SessionState.SPEAKING,
    SessionState.LISTENING,
    SessionState.LEAVING,
  ],
  [SessionState.SPEAKING]: [SessionState.LISTENING, SessionState.LEAVING],
  [SessionState.LEAVING]: [SessionState.DONE],
  [SessionState.DONE]: [],
};

/**
 * In-memory session store + state-machine lifecycle manager.
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  /**
   * Create a new session and return it.
   */
  createSession(
    meetingUrl: string,
    botName: string,
    config: SessionConfig = {},
  ): Session {
    const id = crypto.randomUUID();
    const session: Session = {
      id,
      state: SessionState.IDLE,
      meetingUrl,
      botName,
      questions: [],
      transcript: [],
      config,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * Retrieve a session by id.
   * @throws if not found.
   */
  getSession(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    return session;
  }

  /**
   * List all sessions (newest first).
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Transition a session to a new state.
   * @throws if the transition is invalid.
   */
  updateState(id: string, newState: SessionState): Session {
    const session = this.getSession(id);
    const allowed = VALID_TRANSITIONS[session.state];

    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${session.state} → ${newState}`,
      );
    }

    session.state = newState;

    // Track timestamps for key states
    if (newState === SessionState.HAND_RAISED) {
      session.handRaisedAt = new Date().toISOString();
    }
    if (newState === SessionState.SPEAKING) {
      session.spokeAt = new Date().toISOString();
    }

    return session;
  }

  /**
   * Append a transcript segment to the session buffer.
   */
  addTranscript(id: string, segment: TranscriptSegment): void {
    const session = this.getSession(id);
    session.transcript.push(segment);
  }

  /**
   * Delete a session from the store.
   * Returns the deleted session (or undefined if not found).
   */
  deleteSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    return session;
  }
}
