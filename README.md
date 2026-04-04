# Kira — AI Meeting Bot

An AI-powered meeting bot that joins Zoom calls, reads papers, raises her hand during Q&A, and asks intelligent questions aloud. Powered by [Recall.ai](https://recall.ai), [HeyGen LiveAvatar](https://www.heygen.com), and Claude on [Amazon Bedrock](https://aws.amazon.com/bedrock/).

> **"Hi, I'm Kira, your Amazonian AI."**
> — Kira, AI Principal Solutions Architect

## How It Works

Kira joins a Zoom meeting as an animated avatar (HeyGen LiveAvatar with lip sync). She reads papers beforehand, listens to the discussion, raises her hand during Q&A, and asks insightful questions — with real-time follow-ups based on what people say.

**Stack:**
- **Avatar + Voice:** HeyGen LiveAvatar (handles STT, LLM, TTS, lip sync)
- **Meeting integration:** Recall.ai (bot joins Zoom, audio I/O, transcript)
- **Paper analysis:** Claude Opus on Amazon Bedrock
- **Server:** Express + TypeScript
- **Tunnel:** localhost.run for HTTPS

**Cost per session:** ~$0.50 (Recall.ai) + HeyGen credits (per minute)

## Architecture

```
┌──────────────┐     HTTP/WS      ┌─────────────────────┐
│  CLI / Web   │◄────────────────►│   Express Server    │
│  Dashboard   │                  │   (server/index.ts)  │
└──────────────┘                  └──────┬──────────────┘
                                         │
                    ┌────────────────────┼────────────────┐
                    │                    │                │
              ┌─────▼─────┐      ┌──────▼──────┐  ┌─────▼──────┐
              │ Recall.ai  │      │  Bedrock /   │  │   HeyGen   │
              │  Bot API   │      │   Claude     │  │ LiveAvatar │
              └─────┬──────┘      └─────────────┘  └────────────┘
                    │
              ┌─────▼──────┐
              │ Zoom Call   │
              │ (bot joins) │
              └────────────┘
```

## Prerequisites

- **Node.js 20+** with npm
- **AWS credentials** with Bedrock / Claude access
- **Recall.ai API key** — [recall.ai](https://recall.ai)
- **HeyGen LiveAvatar API key** — [liveavatar.com](https://app.liveavatar.com)
- **localhost.run SSH key** — for HTTPS tunnel

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
- Starts the Express server serving the API, avatar client, and dashboard

## Roadmap

- [ ] **Web dashboard** — upload paper, edit questions, join/leave, raise hand, speak, live transcript. Phase 1 merged ([`f5aa9b4`](https://github.com/alexdown/AIS-test/commit/f5aa9b4)), needs end-to-end testing. Spec: [docs/UI_DESIGN.md](docs/UI_DESIGN.md)
- [ ] **Dynamic context injection** — feed paper content to avatar mid-session via `session.message()` ([#1](https://github.com/alexdown/AIS-test/issues/1))
- [ ] **Detect when Kira is addressed** — ensure she responds to direct questions by name ([#2](https://github.com/alexdown/AIS-test/issues/2))
- [ ] **DOCX comments in dashboard** — extract inline comments on upload, display in UI, auto-include in avatar context ([#3](https://github.com/alexdown/AIS-test/issues/3))

## CLI Commands

```bash
# Join a meeting (with optional paper)
npx tsx cli/index.ts join \
  --meeting-url "https://zoom.us/j/123456" \
  --paper papers/my-paper.pdf

# Check session status
npx tsx cli/index.ts status <session-id>

# Raise hand
npx tsx cli/index.ts raise-hand <session-id>

# Speak the top question
npx tsx cli/index.ts speak <session-id>

# Leave the meeting
npx tsx cli/index.ts leave <session-id>

# Analyze a paper without joining
npx tsx cli/index.ts analyze-paper papers/my-paper.pdf
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create session & join meeting |
| `GET` | `/api/sessions/:id` | Get session details |
| `POST` | `/api/sessions/:id/raise-hand` | Raise hand (chat + avatar overlay) |
| `POST` | `/api/sessions/:id/speak` | Speak text or prepared question |
| `POST` | `/api/sessions/:id/leave` | Leave meeting |
| `POST` | `/api/avatar/speak` | Direct avatar speak command |
| `POST` | `/api/avatar/raise-hand` | Direct avatar raise hand |
| `POST` | `/api/heygen/session` | Create HeyGen avatar session |
| `GET` | `/api/health` | Health check |

## Bot Personality

Kira's personality is configurable per session via system prompt:

```json
{
  "systemPrompt": "You are Kira, an AI Principal Solutions Architect at AWS...",
  "personality": {
    "name": "Kira",
    "style": "professional",
    "introPhrase": "Hi, I'm Kira, your Amazonian AI."
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RECALL_API_KEY` | ✅ | Recall.ai API key |
| `RECALL_REGION` | | Recall region (default: `ap-northeast-1`) |
| `HEYGEN_API_KEY` | ✅ | HeyGen LiveAvatar API key |
| `HEYGEN_AVATAR_ID` | ✅ | HeyGen avatar UUID |
| `HEYGEN_VOICE_ID` | ✅ | HeyGen voice UUID |
| `HEYGEN_CONTEXT_ID` | ✅ | HeyGen context UUID |
| `AWS_REGION` | | AWS region for Bedrock (default: `us-east-1`) |
| `BEDROCK_MODEL_ID` | | Claude model ID |
| `PORT` | | Server port (default: `3000`) |

## License

MIT
