# Kira — AI Meeting Bot

An AI-powered meeting bot that joins Zoom calls, reads papers, raises her hand during Q&A, and asks intelligent questions aloud. Powered by [Recall.ai](https://recall.ai), Claude on [Amazon Bedrock](https://aws.amazon.com/bedrock/), and [ElevenLabs](https://elevenlabs.io).

> **"Hi, I'm Kira, your Amazonian AI."**
> — Kira, AI Principal Solutions Architect

## Current Status (2026-04-04)

**✅ FULLY WORKING — Kira joins Zoom with animated avatar, asks questions, follows up conversationally.**

**Working:**
- ✅ Animated HeyGen LiveAvatar ("rika in blue suit") with lip sync
- ✅ Kira listens to meeting audio and responds in real-time
- ✅ Asks prepared questions about papers she's read
- ✅ Follows up on answers naturally — real conversation
- ✅ Raise hand overlay (✋ on avatar video tile) + chat message
- ✅ Server-controlled speak commands (inject questions via WebSocket)
- ✅ Real-time transcript streaming via WebSocket
- ✅ Paper analysis → question generation via Claude Opus on Bedrock
- ✅ HTTPS tunnel (localhost.run) solves CloudFront WAF for output_media

**Stack:**
- **Avatar + Voice:** HeyGen LiveAvatar (handles STT, LLM, TTS, lip sync)
- **Meeting integration:** Recall.ai (bot joins Zoom, audio I/O, transcript)
- **Paper analysis:** Claude Opus on Amazon Bedrock
- **Server:** Express + TypeScript, runs on VPS
- **Tunnel:** localhost.run for HTTPS

**Cost per session:** ~$0.50 (Recall.ai) + HeyGen credits (per minute)


## Features

- 🤖 **Joins Zoom meetings** via Recall.ai with animated HeyGen LiveAvatar
- 📄 **Reads papers** (PDF, DOCX, TXT) and generates ranked Q&A questions
- 🧠 **Claude-powered analysis** via Amazon Bedrock — generates insightful, context-aware questions
- 🗣️ **Speaks aloud** in meetings with lip-synced avatar (HeyGen LiveAvatar)
- ✋ **Raises hand** — visual overlay on avatar tile + chat message
- 📝 **Real-time transcription** streamed via WebSocket
- 🎭 **Customizable personality** — system prompt, voice, avatar appearance
- 🖥️ **Web dashboard** (coming soon) — upload papers, edit questions, control Kira from your browser
- 🔧 **CLI + API** for programmatic control

## Roadmap

- [x] Animated avatar joins Zoom with lip sync (HeyGen LiveAvatar)
- [x] Paper analysis + question generation (Claude Opus on Bedrock)
- [x] Raise hand (chat + visual overlay)
- [x] Server-controlled speak commands
- [x] Real-time transcript streaming
- [ ] **Web dashboard** — upload paper, edit questions, join/leave, raise hand, speak, live transcript (spec: [docs/UI_DESIGN.md](docs/UI_DESIGN.md))
- [ ] Auto Q&A detection (detect "any questions?" and auto-raise hand)
- [ ] Post-meeting transcript download + summary

## Architecture

```
┌──────────────┐     HTTP/WS      ┌─────────────────────┐
│  CLI / Web   │◄────────────────►│   Express Server    │
│  Interface   │                  │   (server/index.ts)  │
└──────────────┘                  └──────┬──────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
              │ Recall.ai  │      │  Bedrock /   │     │ ElevenLabs  │
              │  Bot API   │      │   Claude     │     │    TTS      │
              └─────┬──────┘      └─────────────┘     └─────────────┘
                    │
              ┌─────▼──────┐
              │ Zoom Call   │
              │ (bot joins) │
              └────────────┘
```

## Prerequisites

- **Node.js 20+** with npm
- **AWS credentials** with Bedrock / Claude access (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- **Recall.ai API key** — [recall.ai](https://recall.ai)
- **ElevenLabs API key** — [elevenlabs.io](https://elevenlabs.io) (for TTS)

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> ai-meeting-bot
cd ai-meeting-bot
npm install
cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys (Recall.ai, HeyGen, AWS credentials)

# 3. Build the avatar client
cd client && npm run build && cd ..

# 4. Start everything (tunnel + server) with one command
bash scripts/start.sh
```

The startup script automatically:
- Starts an HTTPS tunnel via localhost.run (required for Recall.ai output_media)
- Captures the tunnel URL and updates `.env`
- Starts the Express server serving both the API and avatar client

> **Note:** You need an SSH key registered with [localhost.run](https://localhost.run) at `~/.ssh/localhost_run`. The tunnel URL changes on each restart — the script handles this automatically.

# 5. Join a meeting
npx tsx cli/index.ts join --meeting-url "https://zoom.us/j/123456" --paper papers/paper.pdf
```

## CLI Commands

```bash
# Join a meeting (with optional paper)
npx tsx cli/index.ts join \
  --meeting-url "https://zoom.us/j/123456" \
  --paper papers/my-paper.pdf \
  --bot-name "Kira — AI Principal SA"

# Check session status
npx tsx cli/index.ts status <session-id>

# Raise hand (sends ✋ in chat, pre-generates TTS)
npx tsx cli/index.ts raise-hand <session-id>

# Speak the top question
npx tsx cli/index.ts speak <session-id>

# Lower hand
npx tsx cli/index.ts lower-hand <session-id>

# Send a chat message
npx tsx cli/index.ts send-chat <session-id> "Great presentation!"

# Leave the meeting
npx tsx cli/index.ts leave <session-id>

# Analyze a paper without joining
npx tsx cli/index.ts analyze-paper papers/my-paper.pdf
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create session & join meeting |
| `GET` | `/api/sessions` | List all sessions |
| `GET` | `/api/sessions/:id` | Get session details |
| `DELETE` | `/api/sessions/:id` | End session & leave meeting |
| `POST` | `/api/sessions/:id/raise-hand` | Raise hand in meeting chat |
| `POST` | `/api/sessions/:id/speak` | Speak text or top question |
| `POST` | `/api/sessions/:id/lower-hand` | Lower hand |
| `POST` | `/api/sessions/:id/send-chat` | Send chat message |
| `POST` | `/api/sessions/:id/leave` | Leave meeting |
| `POST` | `/api/webhooks/recall` | Recall.ai webhook receiver |
| `GET` | `/api/health` | Health check |

### WebSocket

Connect to `ws://localhost:3000/ws/sessions/:id` to receive real-time events:

```json
{ "type": "state_change", "state": "LISTENING" }
{ "type": "transcript", "segment": { "speaker": "Dr. Smith", "text": "...", "timestamp": 1234567890 } }
{ "type": "bot_status", "status": "in_call_recording" }
```

## Bot Personality

**Kira** is an AI Principal Solutions Architect — your Amazonian AI. She's thoughtful, technically precise, and asks well-structured questions that demonstrate deep understanding of the material.

Personality is customizable per session:

```json
{
  "config": {
    "personality": {
      "name": "Kira",
      "style": "professional",
      "introPhrase": "Hi, I'm Kira, your Amazonian AI. I have a question about"
    },
    "systemPrompt": "You are Kira, an AI Principal Solutions Architect..."
  }
}
```

Available styles: `academic`, `casual`, `provocative`, `professional`

## Cost Estimate

| Service | Cost per Meeting |
|---------|-----------------|
| Recall.ai | ~$0.25 (bot minutes) |
| Bedrock / Claude | ~$0.15 (paper analysis + refinement) |
| ElevenLabs | ~$0.30 (1-2 spoken questions) |
| **Total** | **~$0.70/meeting** |

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

| Variable | Required | Description |
|----------|----------|-------------|
| `RECALL_API_KEY` | ✅ | Recall.ai API key |
| `RECALL_REGION` | | Recall region (default: `ap-northeast-1`) |
| `AWS_ACCESS_KEY_ID` | ✅ | AWS credentials for Bedrock |
| `AWS_SECRET_ACCESS_KEY` | ✅ | AWS credentials for Bedrock |
| `AWS_REGION` | | AWS region (default: `us-east-1`) |
| `BEDROCK_MODEL_ID` | | Claude model ID |
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs API key for TTS |
| `PORT` | | Server port (default: `3000`) |
| `WEBHOOK_BASE_URL` | | Public URL for Recall webhooks |
| `AVATAR_PUBLIC_URL` | | Avatar webpage URL |

## Webhook Tunnel

Recall.ai needs a public URL to send webhook events. For local development:

```bash
# Option 1: localhost.run (free, no install)
ssh -R 80:localhost:3000 localhost.run

# Option 2: ngrok
ngrok http 3000
```

Set the tunnel URL as `WEBHOOK_BASE_URL` in your `.env`.

## License

MIT
