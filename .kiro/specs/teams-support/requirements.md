# Requirements — Microsoft Teams support via Recall.ai

Tracking: GitHub issue #7 "Add Microsoft Teams support via Recall.ai"

## Introduction

Kira currently joins Zoom meetings as an AI avatar via Recall.ai. Recall.ai also
supports Microsoft Teams. This feature extends Kira to join Teams meetings in
addition to Zoom. The scope is deliberately minimal: it is primarily a
config/routing change. The platform is auto-detected server-side from the
meeting URL, and the Recall.ai bot payload uses the correct join-URL field name
for the detected platform. The HeyGen avatar pipeline and all existing Zoom
behavior must remain unchanged.

## Out of scope

- No live verification against a real Teams or Zoom meeting (no live meeting is
  available in this environment). This limitation is recorded in the design and
  in the verification summary.
- No Teams-specific UI beyond letting the user paste a Teams URL into the
  existing meeting-URL field.
- No new runtime dependencies.

## Glossary

- **Platform**: the meeting provider, one of `zoom` or `teams`.
- **detectPlatform(url)**: shared server-side helper that classifies a meeting
  URL as `teams` or `zoom`.

## Requirements

### Requirement 1 — Auto-detect platform from meeting URL

**User story:** As a user, I want to paste either a Zoom or a Teams meeting URL
into the same field, so that I do not have to tell the system which platform I am
using.

#### Acceptance criteria

1. WHEN a session is created with a meeting URL whose host is `teams.microsoft.com`
   (including subdomains such as a regional host) THEN the system SHALL classify
   the platform as `teams`.
2. WHEN a session is created with a Zoom meeting URL (for example
   `https://zoom.us/j/123` or `https://us05web.zoom.us/j/123`) THEN the system
   SHALL classify the platform as `zoom`.
3. WHEN a session is created with any URL that is not recognized as Teams THEN
   the system SHALL default the platform to `zoom`.
4. WHEN the provided meeting URL is malformed or cannot be parsed THEN the system
   SHALL default the platform to `zoom` and SHALL NOT throw.
5. The platform detection SHALL be implemented in exactly one shared helper so
   the URL is not re-parsed in multiple places.

### Requirement 2 — Route to the correct Recall.ai join-URL field

**User story:** As an operator, I want the Recall.ai bot payload to use the
Teams join-URL field for Teams meetings, so that the bot actually joins Teams
calls.

#### Acceptance criteria

1. WHEN the detected platform is `teams` THEN the Recall.ai create-bot payload
   SHALL carry the meeting URL in the `microsoft_teams_join_url` field.
2. WHEN the detected platform is `zoom` THEN the Recall.ai create-bot payload
   SHALL carry the meeting URL exactly as it does today (the existing
   `meeting_url` field), with no change to the Zoom payload shape.
3. The field-name selection SHALL be driven by an explicit `platform` argument
   passed into `createBot`, chosen in one place, rather than by re-parsing the
   URL inside `createBot`.
4. `createBot` SHALL remain backward-compatible: existing callers that do not
   pass a platform SHALL continue to produce the current Zoom payload.

### Requirement 3 — Avatar output_media stays compatible with Teams

**User story:** As a user, I want Kira's animated avatar to appear in Teams
meetings the same way it does in Zoom, so that the experience is identical
across platforms.

#### Acceptance criteria

1. WHEN an avatar URL is provided AND the platform is `teams` THEN the create-bot
   payload SHALL still attach `output_media.camera` (webpage) exactly as it does
   for Zoom.
2. The HeyGen avatar pipeline and the `camera-on` / `output_media` control paths
   SHALL NOT be changed by this feature.
3. The `variant` map SHALL continue to include a `microsoft_teams` entry so the
   Teams bot variant is selected.

### Requirement 4 — Dashboard accepts a Teams URL

**User story:** As a user, I want the dashboard meeting-URL field to accept a
Teams URL, so that I can start a Teams session from the same place I start a Zoom
session.

#### Acceptance criteria

1. The existing meeting-URL input SHALL accept a `teams.microsoft.com` URL and
   submit it unchanged to `POST /api/sessions`.
2. No platform selector or Teams-specific control SHALL be added to the UI.
3. Field labelling/placeholder MAY be updated to indicate that either a Zoom or
   Teams URL is accepted, without changing the submitted value or request shape.

### Requirement 5 — Existing Zoom functionality unaffected

**User story:** As an existing user, I want all current Zoom behavior to keep
working, so that this change is safe to ship.

#### Acceptance criteria

1. WHEN a Zoom URL is used THEN the created session, bot payload, and all control
   flows (join, leave, speak, raise-hand) SHALL behave exactly as before this
   change.
2. The server type-check (`npm run typecheck`) and the dashboard build
   (`npm run build` in `dashboard/`) SHALL pass.
3. No existing public type or API request shape SHALL break; any new field SHALL
   be optional.
