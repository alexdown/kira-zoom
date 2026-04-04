# AGENTS.md — Kira Project Learnings & Working Notes

> This file captures everything learned during development so future sessions don't repeat mistakes.
> Updated: 2026-04-04

---

## Architecture Decisions

- **Recall.ai region:** `ap-northeast-1` (Tokyo) — matches Alessio's account
- **LLM:** Claude Opus on Amazon Bedrock (`global.anthropic.claude-opus-4-6-v1`)
- **TTS:** ElevenLabs (Creator plan, voice: Rachel `21m00Tcm4TlvDq8ikWAM`, model: `eleven_turbo_v2_5`)
- **Avatar:** HeyGen LiveAvatar (API key available, avatar: "rika in blue suit") — NOT YET INTEGRATED
- **Server runs on:** Alessio's OpenClaw VPS (54.83.242.0, port 3000, Ubuntu ARM, 2 cores, 3.7GB RAM)
- **Bot persona:** "Kira (AI Principal SA)" — AWS Principal Solutions Architect, "your Amazonian AI"

---

## Critical Learnings (DO NOT REPEAT THESE MISTAKES)

### 1. CloudFront WAF blocks URLs in Recall.ai API body
- **Problem:** POST to `https://ap-northeast-1.recall.ai/api/v1/bot/` returns 403 from CloudFront when the JSON body contains URLs (e.g., `output_media.camera.config.url` or `realtime_endpoints[].url`)
- **Workaround that works:** Use `curl -d @file.json` with the JSON in a file — STILL GETS BLOCKED
- **What DOES work:** Creating the bot WITHOUT the URL-containing fields, then adding them via separate API calls — PARTIAL (output_media separate endpoint also blocked)
- **What ACTUALLY works for realtime_endpoints:** Use `type: "websocket"` instead of `type: "webhook"` — the websocket URL (`ws://...`) passes through the WAF. Confirmed working.
- **What ACTUALLY works for output_media:** NOT YET SOLVED. The `output_media` endpoint with a webpage URL always gets 403'd. Need to investigate HeyGen integration path (their demo may handle this differently).
- **Recall.ai dashboard webhook config:** Requires HTTPS — our server is HTTP only (no SSL). So dashboard config doesn't work either.

### 2. Em dash (—) in bot name causes issues
- **Problem:** "Kira — AI Principal SA" with em dash sometimes triggers CloudFront WAF
- **Fix:** Use parentheses: "Kira (AI Principal SA)"

### 3. Real-time transcript: WebSocket works, webhook doesn't
- **What works:** `realtime_endpoints` with `type: "websocket"` and `url: "ws://54.83.242.0:3000/ws/recall"` — Recall.ai connects TO our server
- **What doesn't:** `type: "webhook"` with `url: "http://54.83.242.0:3000/api/webhooks/recall"` — blocked by CloudFront WAF
- **Events that work:** `transcript.data`, `transcript.partial_data`
- **Transcript provider:** `recallai_streaming` with `language_code: "en"` — works independently of Zoom captions
- **`meeting_captions` provider:** Requires Zoom captions to be enabled by host AND requires the bot to have specific Zoom integration. Did NOT produce any transcript in our test.

### 4. Transcript streaming is flaky
- **What happened:** Got 2 utterances successfully via WebSocket, then stream went silent despite continued speaking
- **Bot was still alive** (status: in_call_recording, chat messages still worked)
- **Possible causes:**
  - WebSocket connection dropped silently (no reconnect logic)
  - `recallai_streaming` hit a silence threshold and stopped
  - Transcription provider stalled
- **TODO:** Add heartbeat/ping to WebSocket, add verbose logging of ALL raw WS messages (not just transcript), add reconnect logic

### 5. output_audio works WITHOUT output_media
- **Confirmed:** You can send `output_audio` to make the bot speak even without `output_media` configured
- **The bot speaks to the meeting** — participants hear it
- **ElevenLabs voice quality is good** — Rachel voice, `eleven_turbo_v2_5` model
- **gTTS (Google TTS) also works** but sounds robotic — use as last-resort fallback only

### 6. ElevenLabs free tier is useless for API
- Free tier: 0 characters, library voices blocked via API
- Need Creator plan ($29/mo) minimum — Alessio purchased this
- Model: `eleven_turbo_v2_5` works on Creator plan
- Voice ID for Rachel: `21m00Tcm4TlvDq8ikWAM`

### 7. Polly not available
- The IAM role on this machine doesn't have `polly:SynthesizeSpeech` permission
- Would need Alessio to add Polly policy to the instance role
- Not needed since ElevenLabs works

### 8. Bot creation is rate-limited
- Creating too many bots in quick succession triggers CloudFront 403
- Wait 10-30 seconds between bot creation attempts
- GET requests still work when POSTs are blocked

### 9. Transcript API vs real-time
- `GET /transcript/{id}/` returns sentences only AFTER the meeting ends
- During the meeting, this endpoint returns 0 sentences
- Real-time data ONLY comes via `realtime_endpoints` (webhook or websocket)
- The WebSocket endpoint `wss://meeting-data.bot.recall.ai/api/v1/transcript` is for the output_media webpage, not for our server

### 10. Pre-generate TTS before firing
- ElevenLabs TTS generation takes 2-3 seconds
- Pre-generate all question audio when the session starts, cache as mp3 files
- When "go" is triggered, only the output_audio API call needs to happen (instant)

---

## API Keys & Config

- **Recall.ai:** `2b24b54d47555a90d504360c5455edebd298971e` (region: ap-northeast-1)
- **ElevenLabs:** `sk_1f4086e97c0048396e22a2726f4a59992154e6944e29b373` (Creator plan)
- **HeyGen LiveAvatar:** `69478119-2466-11f1-a99e-066a7fa2e369` (avatar: "rika in blue suit")
- **AWS Bedrock:** Uses instance role (no explicit keys needed)
- **Server:** http://54.83.242.0:3000 (port open in security group)
- **GitHub:** Deploy key at `~/.ssh/github_ais`, repo: `alexdown/AIS-test`

---

## Bot Creation Template (working)

```python
requests.post(
    "https://ap-northeast-1.recall.ai/api/v1/bot/",
    headers={
        "Authorization": "Token <KEY>",
        "Content-Type": "application/json"
    },
    json={
        "meeting_url": "<ZOOM_URL>",
        "bot_name": "Kira (AI Principal SA)",
        "recording_config": {
            "transcript": {
                "provider": {
                    "recallai_streaming": {
                        "language_code": "en"
                    }
                }
            },
            "include_bot_in_recording": {"audio": True},
            "realtime_endpoints": [
                {
                    "type": "websocket",
                    "url": "ws://54.83.242.0:3000/ws/recall",
                    "events": ["transcript.data", "transcript.partial_data"]
                }
            ]
        }
    }
)
```

---

## Recall.ai API Cheat Sheet

| Action | Endpoint | Notes |
|--------|----------|-------|
| Create bot | `POST /api/v1/bot/` | Returns bot ID |
| Bot status | `GET /api/v1/bot/{id}` | Check `status_changes[-1].code` |
| Send chat | `POST /api/v1/bot/{id}/send_chat_message/` | `{"message": "text"}` |
| Output audio | `POST /api/v1/bot/{id}/output_audio/` | `{"kind": "mp3", "b64_data": "<base64>"}` |
| Leave call | `POST /api/v1/bot/{id}/leave_call/` | NOT `/leave/` — that 404s |
| Set output media | `POST /api/v1/bot/{id}/output_media/` | Currently blocked by WAF |
| List bots | `GET /api/v1/bot/?limit=10` | |

---

## Next Steps (for tomorrow)

1. **Fix transcript streaming reliability** — add WS heartbeat/reconnect, log ALL raw messages
2. **Integrate HeyGen LiveAvatar** — research their Recall.ai demo repo, get the animated avatar working
3. **Build full conversation loop:** hear → Claude generates follow-up → ElevenLabs TTS → output_audio
4. **Solve output_media WAF issue** — needed for HeyGen avatar webpage
5. **Add SSL** — needed for Recall.ai dashboard webhooks and probably HeyGen
6. **Test with a real multi-person Zoom call**

---

## Test History

### Test 1 (2026-04-04 ~06:50 UTC)
- Bot: `cf5844d8` — "Kira — AI Principal SA"
- No realtime_endpoints, no output_media
- Audio output worked (gTTS, robotic voice)
- Chat messages worked
- No transcript capability

### Test 2 (2026-04-04 ~07:00 UTC)
- Bot: `cabaa897` — "Kira"
- include_bot_in_recording.audio: true
- Audio output worked (gTTS)
- Still no transcript

### Test 3 (2026-04-04 ~07:05 UTC)
- Bot: `26972ac2` — "Kira (AI Principal SA)"
- recallai_streaming provider, no realtime_endpoints
- Transcript API returned 0 sentences (expected — only populates after meeting)
- Polling approach doesn't work for real-time

### Test 4 (2026-04-04 ~07:13 UTC)
- Bot: `ef0ee7b7` — "Kira (AI Principal SA)"
- recallai_streaming + WebSocket realtime_endpoints ✅
- **Real-time transcript WORKED** — received 2 utterances via WS
- Then stream went silent despite continued speaking
- Audio output not retested (already proven)

---

## Update: 2026-04-04 08:53 UTC — FULL SYSTEM WORKING! 🎉

### What works now (end-to-end):
- ✅ HeyGen LiveAvatar with animated lip-synced avatar ("rika in blue suit")
- ✅ Avatar listens to meeting audio, understands context, responds conversationally
- ✅ Avatar asks prepared questions about the paper
- ✅ Avatar follows up on answers naturally
- ✅ Speak commands via WebSocket (server → client → HeyGen session.message())
- ✅ Raise hand overlay (✋ emoji on avatar video tile)
- ✅ Real-time transcript streaming via WebSocket (recallai_streaming)
- ✅ HTTPS tunnel via localhost.run (solves CloudFront WAF issue)

### Root cause of "avatar not showing" bug:
**HeyGen credits ran out.** The first session used the remaining credits. Every subsequent attempt failed with "No credits available for start session" — silently falling back to static avatar. NOT a code issue. Added debug reporting to catch this in future.

### Critical: HeyGen credits
- HeyGen LiveAvatar charges per minute of session time
- Monitor credits at https://app.liveavatar.com
- Error message when depleted: "No credits available for start session"
- Debug endpoint at POST /api/heygen/debug shows the exact error

### Working bot creation template:
```python
{
    "meeting_url": "<ZOOM_URL>",
    "bot_name": "Kira (AI Principal SA)",
    "output_media": {"camera": {"kind": "webpage", "config": {"url": "<TUNNEL_HTTPS_URL>"}}},
    "recording_config": {
        "transcript": {"provider": {"recallai_streaming": {"language_code": "en"}}},
        "include_bot_in_recording": {"audio": True},
        "realtime_endpoints": [{"type": "websocket", "url": "ws://54.83.242.0:3000/ws/recall", "events": ["transcript.data", "transcript.partial_data"]}]
    },
    "variant": {"zoom": "web_4_core"}
}
```

### Architecture (working):
```
Recall.ai bot → loads webpage via output_media (HTTPS tunnel)
→ Webpage creates HeyGen LiveAvatar session
→ HeyGen renders animated avatar + handles STT/LLM/TTS
→ Avatar video + audio stream → bot camera → Zoom meeting
→ Meeting audio → bot mic → HeyGen (listens + responds)
→ Control server can inject speak/raise-hand commands via WebSocket
→ Transcript streams back to server via separate WebSocket
```

### Startup sequence:
1. Start localhost.run tunnel: `ssh -i ~/.ssh/localhost_run -R 80:localhost:3000 ssh.localhost.run`
2. Note the HTTPS URL, update .env
3. Start server: `npx tsx server/index.ts`
4. Create bot via Recall.ai API with output_media pointing to tunnel URL
5. Admit bot from Zoom waiting room
6. HeyGen connects, avatar appears, Kira is live

### Test 5 (2026-04-04 ~08:50 UTC) — SUCCESS ✅
- Bot: `91075930`
- HeyGen avatar visible and animated
- Kira listened, asked questions, followed up on answers
- Full conversational AI in Zoom meeting — WORKING

### 11. NEVER restart the server while Kira is in a call
- **Problem:** Restarting the Express server kills the HeyGen WebRTC session. The bot's browser reloads the page but HeyGen can't recover — it needs a brand new bot + session.
- **Effect:** Avatar falls back to "Starting avatar session" spinner permanently
- **Rule:** If you need to change server code while Kira is in a meeting, DON'T restart. Wait until the meeting ends, or create a new bot after restart.
- **If you must restart mid-meeting:** Kill old bot → restart server → create new bot → have host admit new bot
- **Client-only changes (CSS, React components):** Require `npm run build` in client/ which is safe, BUT the running bot won't pick up the new build until a new bot is created. The Recall.ai bot caches the webpage on first load.

### 12. HeyGen credits check before every meeting
- The "No credits available for start session" error is SILENT — falls back to static avatar with no obvious error
- Always verify credits at https://app.liveavatar.com before deploying Kira
- Debug endpoint POST /api/heygen/debug catches this — check server logs for "FALLBACK_TRIGGERED"
