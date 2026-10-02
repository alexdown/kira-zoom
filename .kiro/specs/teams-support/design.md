# Design — Microsoft Teams support via Recall.ai

Tracking: GitHub issue #7

## Overview

Teams support is a routing change. We detect the platform server-side from the
meeting URL, thread an explicit `platform` value into `RecallService.createBot`,
and let `createBot` choose the correct join-URL field name for the Recall.ai
payload. Zoom keeps its exact current payload; Teams swaps only the join-URL
field. The dashboard reuses its existing meeting-URL field, so the user pastes
either a Zoom or a Teams URL into the same input.

## Current behavior (as found in code)

- `server/services/recall.ts` → `createBot(meetingUrl, botName, avatarUrl?, _webhookUrl?)`
  builds the Recall.ai `POST /bot/` payload. Today the join URL is placed in a
  flat `meeting_url: meetingUrl` field (around line 81). `recording_config`,
  `realtime_endpoints`, and a `variant` map that already includes
  `zoom`, `google_meet`, and `microsoft_teams` (around lines 103-105) are built
  unconditionally. When `avatarUrl` is present, `output_media.camera` (webpage)
  is attached (around line 110).
- `server/routes/sessions.ts` is the single caller of `createBot`
  (around lines 187-191). It passes `body.meetingUrl`, `botName`, the computed
  `avatarUrl`, and `config.webhookBaseUrl`.
- `dashboard/src/components/MeetingControls.tsx` renders the meeting-URL input
  (label "Zoom URL", Zoom placeholder) bound to `state.meeting.zoomUrl`.
- `dashboard/src/App.tsx` (around line 436) calls
  `api.createSession({ meetingUrl: state.meeting.zoomUrl, ... })`.

### Note on the join-URL field name

Issue #7 states that the Recall.ai Teams bot uses `microsoft_teams_join_url`
instead of `join_url`. The current code does not use `join_url` at all; it uses
a flat `meeting_url` string, which is Recall.ai's accepted form for Zoom in this
codebase. To honor the issue's explicit requirement with minimal risk, we switch
ONLY the Teams path to carry the URL under `microsoft_teams_join_url` and leave
the Zoom path exactly on the existing `meeting_url` field. This keeps Zoom
byte-for-byte identical while satisfying the Teams field-name requirement.

## Architecture

```
Dashboard (unchanged request shape)
  POST /api/sessions { meetingUrl, ... }
            │
            ▼
server/routes/sessions.ts
  platform = detectPlatform(body.meetingUrl)   ◄── NEW: single detection point
  recall.createBot(meetingUrl, botName, avatarUrl, webhookBaseUrl, platform)
            │
            ▼
server/services/recall.ts  createBot(..., platform = "zoom")
  if platform === "teams":  payload.microsoft_teams_join_url = meetingUrl
  else:                     payload.meeting_url = meetingUrl   (unchanged)
  (recording_config, variant, output_media attached the same way for both)
            │
            ▼
Recall.ai POST /bot/
```

## Components and changes

### 1. New shared helper: `server/services/platform.ts`

```ts
export type Platform = "zoom" | "teams";

/**
 * Classify a meeting URL as a supported platform.
 * teams.microsoft.com (any subdomain) => "teams"; everything else => "zoom".
 * Never throws: malformed URLs fall back to "zoom".
 */
export function detectPlatform(meetingUrl: string): Platform { ... }
```

Detection rule:
- Parse with `new URL(meetingUrl)`. On parse failure, return `"zoom"`.
- If the hostname equals `teams.microsoft.com` or ends with
  `.teams.microsoft.com` (case-insensitive), return `"teams"`.
- Otherwise return `"zoom"`.

Using hostname matching (not substring) avoids false positives from query
strings or paths that happen to contain the word "teams".

### 2. `RecallService.createBot` — add trailing `platform` argument

New signature (backward-compatible, trailing optional with default):

```ts
async createBot(
  meetingUrl: string,
  botName: string,
  avatarUrl?: string,
  _webhookUrl?: string,
  platform: Platform = "zoom",
): Promise<Record<string, unknown>>
```

Payload change — replace the single unconditional `meeting_url` entry with a
platform switch, leaving everything else (recording_config, realtime_endpoints,
variant, output_media) exactly as it is today:

```ts
const payload: Record<string, unknown> = {
  bot_name: botName,
  recording_config: { ... unchanged ... },
  variant: { zoom: "web_4_core", google_meet: "web_4_core", microsoft_teams: "web_4_core" },
};

if (platform === "teams") {
  payload.microsoft_teams_join_url = meetingUrl;
} else {
  payload.meeting_url = meetingUrl;
}

if (avatarUrl) {
  payload.output_media = { camera: { kind: "webpage", config: { url: avatarUrl } } };
}
```

`output_media` attachment is unchanged and therefore applies identically to both
platforms (Requirement 3).

### 3. `server/routes/sessions.ts` — detect once, pass through

- Import `detectPlatform` from `../services/platform.js`.
- After validating `body.meetingUrl`, compute
  `const platform = detectPlatform(body.meetingUrl);` and log it.
- Pass `platform` as the new fifth argument to `recall.createBot(...)`.

No other route logic changes. The derived platform is not persisted on the
session object (not required by the issue); it is computed deterministically from
the stored `meetingUrl` whenever needed.

### 4. Dashboard — accept Teams URL (labelling only)

The request shape and submitted value are unchanged (server-side detection does
the work). To make the capability discoverable we update only presentation in
`dashboard/src/components/MeetingControls.tsx`:

- Label: "Zoom URL" → "Meeting URL (Zoom or Teams)".
- Placeholder: add a hint that a `teams.microsoft.com` URL is also accepted.

No reducer, state field, API client, or type changes are required. The internal
state key `zoomUrl` is left as-is to avoid a wide, risky rename; it already
carries whatever URL the user pastes.

## Data and type changes

- New type `Platform = "zoom" | "teams"` lives in `server/services/platform.ts`.
- No change to `CreateSessionRequest` or the dashboard `Session`/request types:
  platform is derived server-side, not sent by the client. This satisfies
  "add a platform field only if the types genuinely need it" — they do not.

## How Zoom stays unaffected

- The Zoom branch sets `payload.meeting_url = meetingUrl`, identical to today.
- `createBot`'s new parameter defaults to `"zoom"`, so any caller that omits it
  (and the Zoom detection path) reproduces the current payload exactly.
- `recording_config`, `realtime_endpoints`, `variant`, and `output_media` are
  untouched. The HeyGen pipeline and camera-on/off control paths are untouched.

## Error handling

- `detectPlatform` never throws; malformed URLs default to `"zoom"`.
- Existing bot-creation error handling in `sessions.ts` is unchanged.

## Testing strategy

The repository has no test runner configured (no jest/vitest, no test script).
Per project conventions we do not introduce a persistent test framework. We
verify via:

1. `npm run typecheck` (server) and `npm run build` in `dashboard/`.
2. A throwaway `tsx` script asserting detection:
   - `https://teams.microsoft.com/l/meetup-join/...` → `teams`
   - `https://zoom.us/j/123` → `zoom`
   - `https://us05web.zoom.us/j/123` → `zoom`
   - malformed input → `zoom`
3. A throwaway `tsx` script that inspects the `createBot` payload (via a stubbed
   `fetch`) to confirm:
   - `platform="teams"` → payload has `microsoft_teams_join_url` and NOT
     `meeting_url`, and `output_media` is attached when `avatarUrl` is present.
   - `platform="zoom"` → payload has `meeting_url` (unchanged) and `output_media`
     attached when `avatarUrl` is present.
   The throwaway scripts are removed before the final commit.

### Verification limitation

Live-joining a real Teams or Zoom meeting is out of scope: no live meeting or
valid Recall.ai session is available in this environment. Correctness is
verified by build/type-check, the detection check, and payload inspection. This
limitation is restated in the final verification summary.

## Security note

`AGENTS.md` contains real API keys/secrets. No secret is copied into source or
spec files. Detection and payload construction use only the user-supplied
meeting URL and existing config plumbing.
