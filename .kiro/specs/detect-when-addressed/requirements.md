# Requirements: Detect when Kira is addressed

Tracks GitHub issue #2 ("Detect when Kira is addressed - ensure she responds to direct questions").

## Overview

Kira is an AI meeting participant. The HeyGen LiveAvatar SDK runs in voice chat mode on the avatar webpage (client/) and lets HeyGen's own LLM decide, autonomously, when Kira speaks. In live testing this usually works, but because HeyGen owns the decision it can miss cases:

- A direct question gets lost in crosstalk or background noise.
- The speaker says "Kira" without clear enunciation and HeyGen does not treat it as a trigger.
- HeyGen's LLM judges a question as rhetorical or not aimed at Kira and stays silent.

This feature adds a server-side safety net: watch the real-time transcript for a direct address to Kira (her name plus a question or solicitation), and if HeyGen has not already made Kira start speaking within a short window, nudge the avatar to respond. HeyGen still handles most cases natively; the transcript monitor only catches what it misses.

The nudge reuses the existing avatar command path (server sends a `speak` command with `mode: "message"` over `/ws/avatar-commands`, and the client forwards the text to `heygenSession.message(...)`, which routes through HeyGen's LLM). This is intentionally distinct from the existing silent context-injection path (a HeyGen PATCH), which does not make Kira speak.

## Terminology

- FINAL transcript segment: a `transcript.data` event received on `/ws/recall` (`isPartial = false`).
- PARTIAL transcript segment: a `transcript.partial_data` event (`isPartial = true`). These are half-sentences and must never trigger detection.
- Direct address: a transcript segment that mentions "Kira" by name AND carries a question or an explicit solicitation to respond.
- Nudge: a `speak` command with `mode: "message"` sent to the avatar client, which calls `heygenSession.message(text)`.
- Double-response guard window: the short delay after a detected direct address during which we wait to see whether HeyGen already made Kira start speaking before we send a nudge.

## Requirements

### Requirement 1: Respond to direct questions by name

**User story:** As a meeting participant, I want Kira to answer when I address her by name with a question, so that she behaves like a reliable participant even when HeyGen's own LLM would have stayed silent.

#### Acceptance criteria

1. WHEN a FINAL transcript segment mentions "Kira" (case insensitive, matched as a whole word) AND contains a question or an explicit solicitation THEN the system SHALL treat it as a direct address.
2. WHEN a direct address is detected AND Kira has not started speaking within the guard window (default about 5 seconds, within the issue's 5 to 10 second target) THEN the system SHALL send a nudge so Kira responds.
3. The nudge text SHALL be a short instruction that quotes the triggering transcript excerpt, for example: `Someone just asked you a question. Please respond to: "Kira, what do you think?"`.
4. The nudge SHALL be sent with `mode: "message"` (routes through HeyGen's LLM), never `mode: "exact"` (verbatim repeat).
5. Detection SHALL recognize the phrasings called out in issue #2, including: "Kira, what do you think?", "Can Kira comment on this?", "I'd like to hear from Kira", and "Kira, do you have a follow-up?".

### Requirement 2: No double responses

**User story:** As a meeting participant, I do not want Kira to answer the same question twice, so that she does not talk over herself or sound broken.

#### Acceptance criteria

1. WHEN a direct address is detected THEN the system SHALL start a guard timer and SHALL send the nudge only if the avatar has not started speaking before the timer elapses.
2. The avatar-speaking signal SHALL be derived from the client's HeyGen `AVATAR_SPEAK_STARTED` and `AVATAR_SPEAK_ENDED` events, reported back to the server and tracked as server state.
3. WHEN the avatar is already speaking at the moment a direct address is detected THEN the system SHALL NOT send a nudge.
4. The system SHALL debounce so that the same detected question does not produce more than one nudge.

### Requirement 3: Works in noisy multi-person discussions

**User story:** As a meeting participant in a busy discussion, I want Kira to still catch when she is addressed, so that crosstalk does not cause her to miss questions.

#### Acceptance criteria

1. Detection SHALL operate only on FINAL transcript segments, never on PARTIAL segments, so it does not act on half-sentences.
2. Detection SHALL evaluate each FINAL segment independently and SHALL tolerate interleaved segments from other speakers between the address and the response.
3. Detection SHALL be a pure function of the segment text (plus simple configuration), with no dependency on audio quality, so it is unaffected by background noise beyond what the transcript provider already resolves.

### Requirement 4: Configurable

**User story:** As an operator, I want to turn the transcript-based nudge on or off, so that I can rely on HeyGen alone when it is handling things well.

#### Acceptance criteria

1. The system SHALL expose a per-session flag (for example `transcriptNudgeEnabled`) on `SessionConfig` that enables or disables transcript-based nudging; it SHALL default to on.
2. The system SHALL expose an environment default (for example `TRANSCRIPT_NUDGE_ENABLED`) read in `server/config.ts` `loadConfig()`, surfaced to the dashboard via `/api/config/defaults`.
3. WHEN the per-session flag is disabled THEN the system SHALL NOT send any transcript-based nudge, while HeyGen's native behavior is left untouched.
4. The guard window SHALL be configurable (for example `transcriptNudgeWindowMs`) with a sensible default of about 5000 ms.
5. The `SessionConfig` shape in `server/types.ts` and its mirror in `dashboard/src/types.ts` SHALL stay in sync for any new fields.

## Out of scope

- Any new text-to-speech or `output_audio` pipeline. Kira speaks only through the existing HeyGen client path. (docs/DESIGN.md describes an aspirational TTS detector; this feature does not use it.)
- Changing the silent context-injection (HeyGen PATCH) behavior.
- Detecting indirect or purely contextual address that does not name Kira. This feature targets explicit by-name address, matching issue #2.

## Constraints (from AGENTS.md)

- No em dash characters in any meeting-facing or bot-facing string, including nudge text and names. They can trigger the CloudFront WAF. Use parentheses, commas, or plain hyphens.
- Use finalized transcripts only for detection.
- Do not restart the server mid-meeting.
