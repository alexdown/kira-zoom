# Design: Detect when Kira is addressed

This design grounds issue #2 in the actual Kira codebase. It deliberately does NOT use the aspirational text-to-speech / `output_audio` detector sketched in docs/DESIGN.md. Kira speaks only through the existing HeyGen client path.

## Integration points (actual code)

- `server/index.ts` -> `recallWss.on("connection")` -> `ws.on("message")`: the single place real-time transcript arrives, as `transcript.data` (FINAL) and `transcript.partial_data` (PARTIAL) events. Today it builds `text`/`speaker`, sets `isPartial`, and on non-partial segments calls `sessionManager.addTranscript(...)`, `broadcast(...)`, and `broadcastDashboard(...)`. Detection hooks in here, on FINAL segments only.
- `sendAvatarCommand({ type, text?, mode? })` in `server/index.ts`: fans a JSON command out to all `/ws/avatar-commands` clients. The nudge reuses this with `{ type: "speak", text, mode: "message" }`.
- `/ws/avatar-commands` (`avatarCmdWss` in `server/index.ts`): currently server to client only. This design makes it bidirectional by adding a `ws.on("message")` handler in `avatarCmdWss.on("connection")` to receive the avatar-speaking signal from the client.
- `client/src/App.tsx`: the avatar-command WebSocket `onmessage` handler already dispatches `speak` (calls `heygenSessionRef.current.message(text)` for `mode: "message"`, `.repeat(text)` for `mode: "exact"`), `interrupt`, `raise-hand`, `lower-hand`, `mute`, `unmute`. This is where the client will also SEND an `avatar_speaking` message back to the server.
- `client/src/contexts/LiveAvatarContext.tsx`: already tracks `isAvatarTalking` from HeyGen `AVATAR_SPEAK_STARTED` / `AVATAR_SPEAK_ENDED` (via `AgentEventsEnum`). This is the source of truth for the speaking signal.
- `server/types.ts` `SessionConfig` + `dashboard/src/types.ts` `SessionConfig`: per-session feature flags (kept in sync).
- `server/config.ts` `loadConfig()`: environment defaults; `DEFAULT_*` constants live here too.
- `server/routes/dashboard.ts` `GET /api/config/defaults`: surfaces defaults to the dashboard.
- `server/services/session-manager.ts` `addTranscript(...)`: per-session transcript store; a reasonable home for per-session detection bookkeeping (last nudge time, debounce set) if session-scoped state is preferred over module-level state.

## Component 1: Pure detection module

New module (for example `server/services/mention-detector.ts`) exporting a pure function:

```
isDirectAddress(text: string, botName?: string): { matched: boolean; excerpt?: string }
```

Rules:

1. Name match: the word "Kira" appears, case insensitive, matched on a word boundary (so "Kirana" or "Ukraine" do not match). The configured bot name's first token can also be accepted, but "Kira" is the baseline.
2. Question or solicitation match (AND with the name match):
   - the segment contains a question mark, OR
   - it contains an interrogative lead near the name (what, why, how, can, could, would, do, does, did, is, are, thoughts, think, comment, follow-up, follow up), OR
   - it is an explicit solicitation such as "I'd like to hear from Kira" or "let's hear from Kira" or "over to Kira".
3. On match, return the trimmed segment as `excerpt` (capped to a reasonable length) for use in the nudge text.

The function is pure (no I/O, no clock, no sockets) so it is trivially unit testable (FEAT-004). It must correctly flag the issue #2 examples and reject plain statements that merely mention Kira without a question.

## Component 2: Server-side detection and nudge dispatch

In `recallWss` message handling, after the existing FINAL-segment work (`addTranscript` + broadcasts), for each active session whose state is a listening/active state:

1. If `session.config.transcriptNudgeEnabled` is false (resolved against the env default), do nothing.
2. Call `isDirectAddress(text, botName)`. If not matched, do nothing.
3. Debounce: skip if the normalized excerpt was already nudged recently (per-session recently-nudged record), so the same question does not fire twice.
4. If the avatar is already speaking (server-tracked signal, see Component 3), do nothing (HeyGen is already responding).
5. Otherwise start a guard timer of `transcriptNudgeWindowMs` (default about 5000 ms). When it elapses:
   - if the avatar started speaking at any point during the window, cancel the nudge (HeyGen handled it);
   - else send the nudge via `sendAvatarCommand({ type: "speak", text: buildNudge(excerpt), mode: "message" })` and record the debounce entry.

`buildNudge(excerpt)` returns, for example: `Someone just asked you a question. Please respond to: "<excerpt>"`. No em dash characters anywhere in this string.

Detection uses FINAL segments only; PARTIAL (`transcript.partial_data`) segments are never evaluated. The server does not restart mid-meeting; all state is in-memory and per-session.

Detection passes the resolved bot name into `isDirectAddress` (the first token of `session.config.personality.name ?? botName`, defaulting to "Kira"), so a renamed bot is still detected by name. This keeps detection symmetric with the feedback-loop speaker exclusion, which derives its token from the same configured name.

### Single-session constraint (known limitation)

The avatar-speaking signal is one module-level timestamp and `sendAvatarCommand` fans every command out to all connected avatar clients with no session routing. The whole nudge path therefore assumes exactly one active meeting/avatar at a time, consistent with how `recallWss` and `recoverSessions` already resolve a single active session. This satisfies issue #2's "noisy multi-person" criterion (many speakers in ONE meeting). It does NOT support multiple concurrent meetings: with two sessions, one avatar's speech would suppress the other's nudge, and a nudge computed for one session would be spoken to every avatar. Supporting concurrent meetings is out of scope and would require keying the speaking timestamp by session and routing `sendAvatarCommand` per session.

### Degraded case (avatar-speaking socket down)

The double-response guard depends on the client reporting `avatar_speaking` over `/ws/avatar-commands`. If that socket is down at the moment HeyGen answers on its own, the server observes no speech and may still fire the nudge, producing a double response. Because this feature is a safety net layered on top of HeyGen's native behavior, the degraded outcome is an extra prompt rather than a missed answer, so it is accepted rather than guarded with a server-side fallback.

### Guard-window parsing

`transcriptNudgeWindowMs` is parsed in `server/config.ts` by a pure `parseNudgeWindowMs(raw, fallback = 5000)` helper that falls back to the default when the env value is missing, non-numeric (`NaN`), or negative. This prevents a misconfigured `TRANSCRIPT_NUDGE_WINDOW_MS` from producing `NaN`, which would make `setTimeout(NaN)` fire immediately and collapse the guard window to zero.

## Component 3: Avatar-speaking signal (bidirectional avatar-commands socket)

Today `/ws/avatar-commands` is server to client only, so the server cannot see whether HeyGen already made Kira speak. This design adds a reverse channel:

- Client (`client/src/App.tsx` + `LiveAvatarContext`): when `isAvatarTalking` transitions, send a small JSON message over the already-open avatar-commands socket, for example `{ type: "avatar_speaking", speaking: true }` on `AVATAR_SPEAK_STARTED` and `{ type: "avatar_speaking", speaking: false }` on `AVATAR_SPEAK_ENDED`.
- Server (`avatarCmdWss.on("connection")` in `server/index.ts`): add `ws.on("message", ...)` to parse `avatar_speaking` and update a server-held boolean (for example `avatarSpeaking`, or a per-session field). The guard timer in Component 2 reads this state.

Because the socket is shared with outbound commands, outbound `sendAvatarCommand` behavior is unchanged; only an inbound handler is added.

## Component 4: Configuration

- `server/types.ts` `SessionConfig`: add `transcriptNudgeEnabled?: boolean` and `transcriptNudgeWindowMs?: number`.
- `dashboard/src/types.ts` `SessionConfig`: mirror the same two fields.
- `server/config.ts` `loadConfig()`: add defaults, for example `transcriptNudgeEnabled` from `TRANSCRIPT_NUDGE_ENABLED` (default true) and `transcriptNudgeWindowMs` from `TRANSCRIPT_NUDGE_WINDOW_MS` (default 5000). Add matching fields to the `Config` interface.
- `server/routes/dashboard.ts` `GET /api/config/defaults`: include the new defaults in the response so the dashboard can show and edit them.
- Resolution order per session: use `session.config.transcriptNudgeEnabled` when defined, otherwise fall back to the env default.

## Sequence (detect -> wait -> check-not-answered -> nudge)

1. Participant says "Kira, what do you think?". Recall.ai streams a FINAL `transcript.data` event to `/ws/recall`.
2. Server builds `text` and `speaker`, stores and broadcasts the segment (existing behavior), then runs detection on the FINAL segment.
3. `isDirectAddress` matches (name + question). Nudge is not disabled, excerpt not recently nudged, avatar not currently speaking.
4. Server starts a guard timer of about 5 seconds.
5. Meanwhile, if HeyGen decides on its own to answer, the client emits `AVATAR_SPEAK_STARTED` and reports `avatar_speaking: true` back to the server.
6. When the timer elapses: if the avatar spoke during the window, the nudge is cancelled (no double response). Otherwise the server sends `sendAvatarCommand({ type: "speak", text: 'Someone just asked you a question. Please respond to: "Kira, what do you think?"', mode: "message" })`.
7. The client receives the `speak` command and calls `heygenSession.message(text)`, so HeyGen's LLM produces Kira's spoken response.

## Testing strategy (feeds FEAT-004)

- Unit test `isDirectAddress` against the issue #2 phrasings (all should match) and against negatives (mentions of Kira with no question, questions that do not name Kira, partial fragments). Pure function, no mocks needed.
- Unit test `buildNudge` to confirm it embeds the excerpt and contains no em dash character.
- The timer/debounce/avatar-speaking orchestration in `server/index.ts` is integration-shaped; where feasible, extract the decision logic into a small testable helper so the guard behavior can be unit tested with a fake clock.

## AGENTS.md compliance

- No em dash characters in nudge text, bot name, or any meeting-facing string.
- Detection uses finalized transcripts only.
- No server restart required; the change is additive and in-memory.
- The spoken nudge stays separate from the existing silent context-injection (HeyGen PATCH) path.
