"""
Recall.ai Meeting Bot — AI Paper Discussant
Joins a Zoom call, listens in real-time, and asks questions about a paper.

Architecture:
1. Bot joins Zoom via Recall.ai API
2. Real-time transcript streamed via webhook
3. LLM (OpenAI/Anthropic) reads the paper + transcript, decides when to speak
4. TTS converts response to audio
5. Audio sent back to meeting via Recall.ai output_audio endpoint

Requirements:
- pip install fastapi uvicorn httpx openai anthropic

Usage:
1. Set environment variables (see below)
2. Start ngrok: ngrok http 8765 --domain your-domain.ngrok-free.app
3. Start server: python recall_bot.py serve
4. Join a meeting: python recall_bot.py join --zoom-url "https://zoom.us/j/..." --paper paper.txt
5. Trigger speak: python recall_bot.py speak --bot-id <id> --text "My question..."
"""

import os
import sys
import json
import base64
import asyncio
import argparse
import logging
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

# === Config ===
RECALL_API_KEY = os.environ.get("RECALL_API_KEY", "2b24b54d47555a90d504360c5455edebd298971e")
RECALL_REGION = os.environ.get("RECALL_REGION", "ap-northeast-1")
RECALL_API = f"https://{RECALL_REGION}.recall.ai/api/v1"
RECALL_HEADERS = {
    "Authorization": f"Token {RECALL_API_KEY}",
    "Content-Type": "application/json"
}

NGROK_BASE = os.environ.get("NGROK_BASE", "https://your-domain.ngrok-free.app")
BOT_NAME = os.environ.get("BOT_NAME", "Discussion Facilitator")

# TTS config (OpenAI TTS)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("recall-bot")

# === State ===
# In-memory state for active bots
active_bots = {}  # bot_id -> {paper, transcript, question, status}

app = FastAPI(title="Recall.ai Paper Discussant")


# === API Helpers ===

async def create_bot(meeting_url: str, paper_text: str = "", question: str = "") -> dict:
    """Create a Recall.ai bot and join a meeting."""
    body = {
        "meeting_url": meeting_url,
        "bot_name": BOT_NAME,
        "recording_config": {
            "transcript": {
                "provider": {
                    "recallai_streaming": {
                        "language_code": "en",
                        "filter_profanity": False,
                        "mode": "prioritize_low_latency"
                    }
                }
            },
            "participant_events": {},
            "realtime_endpoints": [
                {
                    "type": "webhook",
                    "url": f"{NGROK_BASE}/webhook",
                    "events": [
                        "transcript.data",
                        "participant_events.join",
                        "participant_events.leave",
                        "participant_events.speech_on",
                        "participant_events.speech_off",
                        "bot.status_change"
                    ]
                }
            ]
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{RECALL_API}/bot", headers=RECALL_HEADERS, json=body)
        r.raise_for_status()
        data = r.json()

    bot_id = data["id"]
    active_bots[bot_id] = {
        "paper": paper_text,
        "question": question,
        "transcript": [],
        "status": "joining",
        "created": datetime.utcnow().isoformat(),
        "meeting_url": meeting_url
    }

    log.info(f"Bot created: {bot_id} for meeting: {meeting_url}")
    return data


async def send_audio_to_meeting(bot_id: str, audio_bytes: bytes, kind: str = "mp3"):
    """Send audio to the meeting (bot speaks)."""
    b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
    body = {
        "kind": kind,
        "b64_data": b64_audio
    }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{RECALL_API}/bot/{bot_id}/output_audio/",
            headers=RECALL_HEADERS,
            json=body
        )
        r.raise_for_status()

    log.info(f"Audio sent to bot {bot_id}")
    return r.json()


async def generate_tts(text: str, voice: str = "alloy") -> bytes:
    """Generate speech audio from text using OpenAI TTS."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set — needed for TTS")

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "tts-1",
                "input": text,
                "voice": voice,
                "response_format": "mp3"
            }
        )
        r.raise_for_status()
        return r.content


async def speak_in_meeting(bot_id: str, text: str, voice: str = "alloy"):
    """Full pipeline: text -> TTS -> send audio to meeting."""
    log.info(f"Generating speech for bot {bot_id}: {text[:80]}...")
    audio = await generate_tts(text, voice)
    log.info(f"TTS generated: {len(audio)} bytes")
    result = await send_audio_to_meeting(bot_id, audio)
    log.info(f"Bot {bot_id} is speaking in the meeting")
    return result


async def get_bot_status(bot_id: str) -> dict:
    """Get current bot status."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{RECALL_API}/bot/{bot_id}", headers=RECALL_HEADERS)
        r.raise_for_status()
        return r.json()


async def leave_meeting(bot_id: str) -> dict:
    """Make the bot leave the meeting."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{RECALL_API}/bot/{bot_id}/leave/", headers=RECALL_HEADERS)
        r.raise_for_status()
        return r.json()


# === Webhook Handlers ===

@app.post("/webhook")
async def handle_webhook(request: Request):
    """Handle real-time events from Recall.ai."""
    body = await request.json()
    event = body.get("event", "unknown")
    bot_id = body.get("data", {}).get("bot_id", "unknown")

    if event == "transcript.data":
        words = body.get("data", {}).get("data", {}).get("words", [])
        text = " ".join(w.get("text", "") for w in words)
        speaker = body.get("data", {}).get("data", {}).get("speaker", "Unknown")

        if bot_id in active_bots:
            active_bots[bot_id]["transcript"].append({
                "speaker": speaker,
                "text": text,
                "timestamp": datetime.utcnow().isoformat()
            })

        log.info(f"[{speaker}]: {text}")

    elif event == "bot.status_change":
        status = body.get("data", {}).get("status", {}).get("code", "unknown")
        if bot_id in active_bots:
            active_bots[bot_id]["status"] = status
        log.info(f"Bot {bot_id} status: {status}")

    elif event.startswith("participant_events."):
        action = event.split(".")[-1]
        participant = body.get("data", {}).get("data", {}).get("participant_name", "Unknown")
        log.info(f"Participant {action}: {participant}")

    return JSONResponse({"status": "ok"})


# === Control Endpoints ===

@app.get("/status")
async def status():
    """Get status of all active bots."""
    return {
        "active_bots": {
            bid: {
                "status": info["status"],
                "transcript_lines": len(info["transcript"]),
                "question": info.get("question", ""),
                "created": info["created"]
            }
            for bid, info in active_bots.items()
        }
    }


@app.get("/transcript/{bot_id}")
async def get_transcript(bot_id: str):
    """Get the full transcript for a bot."""
    if bot_id not in active_bots:
        return JSONResponse({"error": "Bot not found"}, status_code=404)
    return {"transcript": active_bots[bot_id]["transcript"]}


@app.post("/speak/{bot_id}")
async def speak_endpoint(bot_id: str, request: Request):
    """Make the bot speak in the meeting."""
    body = await request.json()
    text = body.get("text", "")
    voice = body.get("voice", "alloy")

    if not text:
        return JSONResponse({"error": "No text provided"}, status_code=400)

    try:
        result = await speak_in_meeting(bot_id, text, voice)
        return {"status": "speaking", "text": text, "result": result}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/join")
async def join_endpoint(request: Request):
    """Join a meeting."""
    body = await request.json()
    meeting_url = body.get("meeting_url", "")
    paper = body.get("paper", "")
    question = body.get("question", "")

    if not meeting_url:
        return JSONResponse({"error": "No meeting_url provided"}, status_code=400)

    try:
        result = await create_bot(meeting_url, paper, question)
        return {"status": "joining", "bot_id": result["id"], "bot_name": BOT_NAME}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/leave/{bot_id}")
async def leave_endpoint(bot_id: str):
    """Make the bot leave."""
    try:
        result = await leave_meeting(bot_id)
        return {"status": "leaving", "result": result}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# === CLI ===

def main():
    parser = argparse.ArgumentParser(description="Recall.ai Paper Discussant Bot")
    subparsers = parser.add_subparsers(dest="command")

    # Serve
    serve_parser = subparsers.add_parser("serve", help="Start the webhook server")
    serve_parser.add_argument("--port", type=int, default=8765)
    serve_parser.add_argument("--host", default="0.0.0.0")

    # Join
    join_parser = subparsers.add_parser("join", help="Join a Zoom meeting")
    join_parser.add_argument("--zoom-url", required=True, help="Zoom meeting URL")
    join_parser.add_argument("--paper", help="Path to paper text file")
    join_parser.add_argument("--question", help="Question to ask")

    # Speak
    speak_parser = subparsers.add_parser("speak", help="Make the bot speak")
    speak_parser.add_argument("--bot-id", required=True)
    speak_parser.add_argument("--text", required=True)
    speak_parser.add_argument("--voice", default="alloy")

    # Status
    subparsers.add_parser("status", help="Get bot status")

    # Leave
    leave_parser = subparsers.add_parser("leave", help="Make bot leave meeting")
    leave_parser.add_argument("--bot-id", required=True)

    args = parser.parse_args()

    if args.command == "serve":
        log.info(f"Starting webhook server on {args.host}:{args.port}")
        log.info(f"Webhook URL: {NGROK_BASE}/webhook")
        log.info(f"Recall region: {RECALL_REGION}")
        uvicorn.run(app, host=args.host, port=args.port)

    elif args.command == "join":
        paper_text = ""
        if args.paper:
            paper_text = Path(args.paper).read_text()
        result = asyncio.run(create_bot(args.zoom_url, paper_text, args.question or ""))
        print(f"Bot ID: {result['id']}")
        print(f"Status: joining meeting...")

    elif args.command == "speak":
        result = asyncio.run(speak_in_meeting(args.bot_id, args.text, args.voice))
        print(f"Speaking: {args.text}")

    elif args.command == "status":
        # List recent bots from API
        import requests
        r = requests.get(f"{RECALL_API}/bot/?limit=5", headers=RECALL_HEADERS)
        for bot in r.json().get("results", []):
            status = bot.get("status_changes", [{}])[-1].get("code", "?")
            print(f"  {bot['id'][:12]}... | {bot.get('bot_name','?')} | {status}")

    elif args.command == "leave":
        result = asyncio.run(leave_meeting(args.bot_id))
        print(f"Bot leaving: {result}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
