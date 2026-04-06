import type { Session, Question, SessionConfig, ConfigDefaults, ExtractedComment } from '../types';

const BASE_URL = '';

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
  paperSummary?: string;
  questions?: Question[];
  comments?: Array<{ author: string; comment: string; anchored_text: string }>;
  config?: SessionConfig;
}) {
  return request<Session>('POST', '/api/sessions', data);
}

export function deleteSession(id: string) {
  return request<void>('DELETE', `/api/sessions/${id}`);
}

// ── Session Control ──

export function raiseHand(sessionId: string) {
  return request<{ state: string; message: string; topQuestion: string | null }>(
    'POST',
    `/api/sessions/${sessionId}/raise-hand`,
  );
}

export function speak(sessionId: string, data: { questionId?: string; text?: string; refineFromTranscript?: boolean }) {
  return request<{ state: string; text: string; audioDurationMs: number }>(
    'POST',
    `/api/sessions/${sessionId}/speak`,
    data,
  );
}

export function lowerHand(sessionId: string) {
  return request<{ state: string; message: string }>(
    'POST',
    `/api/sessions/${sessionId}/lower-hand`,
  );
}

export function leaveSession(sessionId: string) {
  return request<{ state: string; message: string }>(
    'POST',
    `/api/sessions/${sessionId}/leave`,
  );
}

export function sendChat(sessionId: string, message: string) {
  return request<{ sent: boolean; message: string }>(
    'POST',
    `/api/sessions/${sessionId}/send-chat`,
    { message },
  );
}

// ── Avatar Direct Control ──

export function avatarSpeak(text: string, mode = 'message') {
  return request<{ status: string; connectedClients: number }>(
    'POST',
    '/api/avatar/speak',
    { text, mode },
  );
}

export function avatarRaiseHand(botId?: string) {
  return request<{ status: string }>(
    'POST',
    '/api/avatar/raise-hand',
    { botId },
  );
}

export function avatarLowerHand() {
  return request<{ status: string }>(
    'POST',
    '/api/avatar/lower-hand',
  );
}

// ── Paper Extraction ──

export function extractPaper(data: string, fileName: string) {
  return request<{ text: string; comments: ExtractedComment[] }>(
    'POST',
    '/api/papers/extract',
    { data, fileName },
  );
}

// ── Paper Analysis ──

export function analyzePaper(data: { text: string; maxQuestions?: number; personality?: { style?: string }; systemPrompt?: string }) {
  return request<{ summary: string; questions: Question[] }>(
    'POST',
    '/api/papers/analyze',
    data,
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
    'PATCH',
    `/api/sessions/${sessionId}/questions`,
    { questions },
  );
}

// ── Config ──

export function getDefaults() {
  return request<ConfigDefaults>('GET', '/api/config/defaults');
}

// ── HeyGen Context ──

export function getHeygenContext() {
  return request<{ name: string; prompt: string; opening_text: string; id: string }>(
    'GET',
    '/api/heygen/context',
  );
}

export function updateHeygenContext(data: { name: string; prompt: string; opening_text: string }) {
  return request<{ name: string; prompt: string; opening_text: string; id: string }>(
    'PATCH',
    '/api/heygen/context',
    data,
  );
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
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getConfigDefaults() {
  return request<{
    defaultBotName: string;
    defaultTtsVoice: string;
    defaultSystemPrompt: string;
    availableVoices: string[];
    availableStyles: string[];
    personality: { name: string; style: string; introPhrase: string };
  }>('GET', '/api/config/defaults');
}
