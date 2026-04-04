#!/usr/bin/env node
// ──────────────────────────────────────────────
// AI Meeting Bot — CLI entry point
// ──────────────────────────────────────────────

import { Command } from "commander";
import { joinCommand } from "./commands/join.js";
import { statusCommand } from "./commands/status.js";
import { raiseHandCommand } from "./commands/raise-hand.js";
import { speakCommand } from "./commands/speak.js";
import { lowerHandCommand } from "./commands/lower-hand.js";
import { sendChatCommand } from "./commands/send-chat.js";
import { leaveCommand } from "./commands/leave.js";
import { analyzePaperCommand } from "./commands/analyze-paper.js";

const program = new Command();

program
  .name("meeting-bot")
  .description("AI Meeting Bot CLI — join Zoom meetings, raise hand, ask questions")
  .version("0.1.0");

// ── join ─────────────────────────────────────
program
  .command("join")
  .description("Create a session and join a Zoom meeting")
  .requiredOption("-u, --meeting-url <url>", "Zoom meeting URL")
  .option("-p, --paper <path>", "Path to paper file (PDF or text)")
  .option("-n, --bot-name <name>", "Bot display name", "Research Assistant")
  .option("--auto-raise", "Automatically raise hand when Q&A is detected")
  .action(joinCommand);

// ── status ───────────────────────────────────
program
  .command("status [sessionId]")
  .description("Get session status, or list all sessions")
  .action(statusCommand);

// ── raise-hand ───────────────────────────────
program
  .command("raise-hand <sessionId>")
  .description("Raise hand in a meeting session")
  .action(raiseHandCommand);

// ── speak ────────────────────────────────────
program
  .command("speak <sessionId>")
  .description("Speak a question or custom text")
  .option("-t, --text <text>", "Custom text to speak instead of prepared question")
  .option("-q, --question-id <id>", "Specific question ID to ask")
  .action(speakCommand);

// ── lower-hand ───────────────────────────────
program
  .command("lower-hand <sessionId>")
  .description("Lower hand in a meeting session")
  .action(lowerHandCommand);

// ── send-chat ────────────────────────────────
program
  .command("send-chat <sessionId>")
  .description("Send a chat message in the meeting")
  .requiredOption("-m, --message <text>", "Message to send")
  .action(sendChatCommand);

// ── leave ────────────────────────────────────
program
  .command("leave <sessionId>")
  .description("Leave a meeting session")
  .action(leaveCommand);

// ── analyze-paper ────────────────────────────
program
  .command("analyze-paper")
  .description("Analyze a paper without joining a meeting")
  .requiredOption("-f, --file <path>", "Path to paper file (PDF or text)")
  .action(analyzePaperCommand);

program.parse();
