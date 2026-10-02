# Tasks: Detect when Kira is addressed

Implementation plan derived from requirements.md and design.md. Tasks are grouped by the features that carry them. Each references concrete files.

## FEAT-001: Spec and baseline (this feature)

- [x] Install dependencies (`npm install` at repo root) and record a green `npm run typecheck` baseline.
- [x] Write `.kiro/specs/detect-when-addressed/requirements.md` (issue #2 goal, current vs desired behavior, four acceptance criteria).
- [x] Write `.kiro/specs/detect-when-addressed/design.md` grounded in actual integration points (recallWss handler, sendAvatarCommand `mode: "message"`, `/ws/avatar-commands`, `AVATAR_SPEAK_STARTED`/`ENDED`, `SessionConfig`, `config.ts` `loadConfig`).
- [x] Write this `tasks.md`.
- [x] Add a short "Detect when Kira is addressed" note to `AGENTS.md`.

## FEAT-002: Detection module, config, and types

- [ ] Create `server/services/mention-detector.ts` exporting a pure `isDirectAddress(text, botName?)` returning `{ matched, excerpt? }`.
  - [ ] Word-boundary, case-insensitive match on "Kira".
  - [ ] Question/solicitation match (question mark, interrogative lead near the name, or explicit "hear from Kira" style solicitation).
  - [ ] Must flag all issue #2 examples and reject plain mentions with no question.
- [ ] Create a pure `buildNudge(excerpt)` helper (co-located) returning `Someone just asked you a question. Please respond to: "<excerpt>"` with no em dash character.
- [ ] Add `transcriptNudgeEnabled?: boolean` and `transcriptNudgeWindowMs?: number` to `SessionConfig` in `server/types.ts`.
- [ ] Mirror the same two fields in `dashboard/src/types.ts` `SessionConfig`.
- [ ] Add `transcriptNudgeEnabled` (env `TRANSCRIPT_NUDGE_ENABLED`, default true) and `transcriptNudgeWindowMs` (env `TRANSCRIPT_NUDGE_WINDOW_MS`, default 5000) to the `Config` interface and `loadConfig()` in `server/config.ts`.
- [ ] Surface the new defaults in `GET /api/config/defaults` in `server/routes/dashboard.ts`.
- [ ] `npm run typecheck` stays green.

## FEAT-003: Server integration (transcript hook, timer/debounce, speaking signal, nudge dispatch, client reporting)

- [ ] In `server/index.ts` `recallWss` message handler, on FINAL segments only, after existing `addTranscript`/broadcast work, run detection per active session.
- [ ] Respect `session.config.transcriptNudgeEnabled` resolved against the env default; skip when disabled.
- [ ] Implement per-session debounce so the same question is not nudged twice.
- [ ] Implement the guard timer (`transcriptNudgeWindowMs`, default about 5000 ms): send the nudge only if the avatar has not started speaking during the window.
- [ ] Make `/ws/avatar-commands` bidirectional: add `ws.on("message")` in `avatarCmdWss.on("connection")` to parse `{ type: "avatar_speaking", speaking }` and track server-side avatar-speaking state.
- [ ] Dispatch the nudge via `sendAvatarCommand({ type: "speak", text: buildNudge(excerpt), mode: "message" })`.
- [ ] In `client/src/App.tsx` (with `LiveAvatarContext` `isAvatarTalking`), send `{ type: "avatar_speaking", speaking }` over the avatar-commands socket on `AVATAR_SPEAK_STARTED`/`AVATAR_SPEAK_ENDED`.
- [ ] `npm run typecheck` stays green; `cd client && npm run build` succeeds (client source changed).

## FEAT-004: Tests

- [ ] Add `vitest` as a root devDependency and a `test` script to `package.json`.
- [ ] Unit test `isDirectAddress` against issue #2 positives and clear negatives.
- [ ] Unit test `buildNudge` embeds the excerpt and contains no em dash character.
- [ ] If guard decision logic is extracted into a helper, unit test it with a fake clock (nudge fires only when the avatar did not speak in the window; debounce prevents repeats).
- [ ] `npm test` and `npm run typecheck` both pass.
