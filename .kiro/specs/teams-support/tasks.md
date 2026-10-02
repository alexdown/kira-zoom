# Tasks — Microsoft Teams support via Recall.ai

Tracking: GitHub issue #7. Each task maps to requirements in `requirements.md`
and the components in `design.md`. Check off tasks as they complete.

- [ ] 1. Environment setup and baseline
  - Run `npm install` at the worktree root and `npm install` in `dashboard/`.
  - Confirm baseline is green: `npm run typecheck` (server) and
    `npm run build` in `dashboard/`.
  - _Requirements: 5.2_

- [ ] 2. Add shared platform-detection helper
  - Create `server/services/platform.ts` exporting
    `type Platform = "zoom" | "teams"` and
    `detectPlatform(meetingUrl: string): Platform`.
  - Rule: parse with `new URL(...)`; hostname `teams.microsoft.com` or
    `*.teams.microsoft.com` (case-insensitive) → `"teams"`; otherwise `"zoom"`;
    malformed/unparseable URL → `"zoom"` (never throws).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 3. Thread platform into `createBot` and switch the join-URL field
  - In `server/services/recall.ts`, add a trailing optional parameter
    `platform: Platform = "zoom"` to `createBot` (import `Platform` from
    `./platform.js`).
  - Replace the single `meeting_url: meetingUrl` payload entry with a switch:
    `platform === "teams"` → set `microsoft_teams_join_url`; otherwise set
    `meeting_url` (unchanged Zoom shape).
  - Leave `recording_config`, `realtime_endpoints`, `variant`, and the
    `output_media` attachment exactly as they are today.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 5.1_

- [ ] 4. Detect platform once in the session route and pass it through
  - In `server/routes/sessions.ts`, import `detectPlatform` from
    `../services/platform.js`.
  - After validating `body.meetingUrl`, compute
    `const platform = detectPlatform(body.meetingUrl);`, log it, and pass it as
    the new fifth argument to `recall.createBot(...)`.
  - _Requirements: 1.5, 2.3_

- [ ] 5. Dashboard: label the meeting-URL field for Zoom or Teams
  - In `dashboard/src/components/MeetingControls.tsx`, update the label to
    "Meeting URL (Zoom or Teams)" and extend the placeholder to indicate a
    `teams.microsoft.com` URL is accepted.
  - Do NOT change state, reducer, API client, request shape, or the submitted
    value.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 6. Verify (build + type-check + detection + payload inspection)
  - Run `npm run typecheck` (server) and `npm run build` in `dashboard/`;
    both must pass.
  - Throwaway `tsx` detection check: Teams meetup-join URL → `teams`;
    `https://zoom.us/j/123` and `https://us05web.zoom.us/j/123` → `zoom`;
    malformed → `zoom`.
  - Throwaway `tsx` payload-inspection check (stub `fetch`): `teams` payload has
    `microsoft_teams_join_url` and not `meeting_url`; `zoom` payload has
    `meeting_url`; `output_media` attached when `avatarUrl` present in both.
  - Remove the throwaway scripts before the final commit.
  - Record results and the live-meeting verification limitation in a summary.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 5.2_
