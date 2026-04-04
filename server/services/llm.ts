import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type SystemContentBlock,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import type { Config } from "../config.js";
import { DEFAULT_SYSTEM_PROMPT } from "../config.js";
import type { Question, Personality, PersonalityStyle } from "../types.js";

// ──────────────────────────────────────────────
// Style descriptors used in prompts
// ──────────────────────────────────────────────

const STYLE_INSTRUCTIONS: Record<PersonalityStyle, string> = {
  academic:
    "Use formal academic language. Reference methodology, statistical rigor, and theoretical frameworks. Be precise and measured.",
  casual:
    "Use conversational, approachable language. Ask questions the way a curious attendee would — friendly but substantive.",
  provocative:
    "Be intellectually bold. Challenge assumptions, point out potential weaknesses, and push the speaker to defend their claims. Stay respectful but direct.",
  professional:
    "Be professional but approachable. Technically sharp and well-structured. Demonstrate deep domain expertise while remaining concise and actionable. Reflect technical excellence.",
};

/**
 * Amazon Bedrock / Claude wrapper for paper analysis and Q&A detection.
 *
 * Every public method accepts an optional `sessionSystemPrompt` that gets
 * prepended to the task-specific prompt, letting each session carry its own
 * personality / tone.
 */
export class LLMService {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private fallbackModelId: string;
  private defaultSystemPrompt: string;

  constructor(config: Config) {
    this.client = new BedrockRuntimeClient({ region: config.awsRegion });
    this.modelId = config.bedrockModelId;
    this.fallbackModelId = "anthropic.claude-3-5-sonnet-20241022-v2:0";
    this.defaultSystemPrompt = config.defaultSystemPrompt;
  }

  // ── helpers ───────────────────────────────────

  /**
   * Build the full system prompt by combining:
   *   1. Session-level system prompt (or global default)
   *   2. Personality / style instructions (if provided)
   *   3. Task-specific instructions
   */
  private buildSystemPrompt(
    taskPrompt: string,
    sessionSystemPrompt?: string,
    personality?: Personality,
  ): string {
    const parts: string[] = [];

    // 1. Session or default persona
    parts.push(sessionSystemPrompt ?? this.defaultSystemPrompt);

    // 2. Personality style
    if (personality?.style) {
      parts.push(STYLE_INSTRUCTIONS[personality.style]);
    }
    if (personality?.name) {
      parts.push(`Your name is "${personality.name}".`);
    }

    // 3. Task-specific instructions
    parts.push(taskPrompt);

    return parts.join("\n\n");
  }

  /**
   * Send a Converse request to Bedrock. Falls back to Sonnet if the
   * primary model is unavailable.
   */
  private async converse(
    systemPrompt: string,
    userText: string,
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const messages: Message[] = [
      {
        role: "user",
        content: [{ text: userText } as ContentBlock],
      },
    ];

    const params = {
      modelId: this.modelId,
      system: [{ text: systemPrompt } as SystemContentBlock],
      messages,
      inferenceConfig: {
        temperature: opts?.temperature ?? 0.7,
        maxTokens: opts?.maxTokens ?? 4096,
      },
    };

    try {
      return await this.sendConverse(params);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (
        msg.includes("is not supported") ||
        msg.includes("AccessDeniedException") ||
        msg.includes("ValidationException")
      ) {
        console.warn(
          `Bedrock model ${this.modelId} unavailable, falling back to ${this.fallbackModelId}: ${msg}`,
        );
        return await this.sendConverse({
          ...params,
          modelId: this.fallbackModelId,
        });
      }
      throw err;
    }
  }

  private async sendConverse(params: {
    modelId: string;
    system: SystemContentBlock[];
    messages: Message[];
    inferenceConfig: { temperature: number; maxTokens: number };
  }): Promise<string> {
    const command = new ConverseCommand(params);
    const response = await this.client.send(command);

    const outputContent = response.output?.message?.content;
    if (!outputContent || outputContent.length === 0) {
      throw new Error("Empty response from Bedrock Converse API");
    }

    const textBlock = outputContent.find((b) => "text" in b);
    if (!textBlock || !("text" in textBlock)) {
      throw new Error("No text block in Bedrock Converse response");
    }

    return textBlock.text as string;
  }

  /**
   * Extract JSON from Claude's response. Claude sometimes wraps JSON in
   * markdown code fences — strip those if present.
   */
  private extractJSON(text: string): string {
    const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenced) return fenced[1]!.trim();
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) return braceMatch[0];
    return text.trim();
  }

  // ── public methods ────────────────────────────

  /**
   * Analyze a paper and generate a summary + ranked questions.
   *
   * @param text        Raw paper text
   * @param systemPrompt  Per-session system prompt override
   * @param personality   Per-session personality settings
   */
  async analyzePaper(
    text: string,
    sessionSystemPrompt?: string,
    personality?: Personality,
  ): Promise<{ summary: string; questions: Question[] }> {
    const taskPrompt = `Given a paper's text, produce:
1. A concise summary (2-3 paragraphs) covering key claims, methodology, and conclusions.
2. 3-5 ranked questions that would be appropriate to ask during a Q&A session. Questions should be insightful, specific, and demonstrate engagement with the material.

Respond ONLY with a JSON object (no explanation outside the JSON):
{
  "summary": "...",
  "questions": [
    { "text": "...", "rationale": "...", "priority": 1 },
    ...
  ]
}

Priority 1 = most important. Each question should have a clear rationale explaining why it's worth asking.`;

    const systemPrompt = this.buildSystemPrompt(
      taskPrompt,
      sessionSystemPrompt,
      personality,
    );

    try {
      const raw = await this.converse(
        systemPrompt,
        `Analyze this paper and generate questions:\n\n${text.slice(0, 30000)}`,
        { temperature: 0.7 },
      );

      const parsed = JSON.parse(this.extractJSON(raw)) as {
        summary: string;
        questions: Array<{
          text: string;
          rationale: string;
          priority: number;
        }>;
      };

      const questions: Question[] = parsed.questions.map((q, i) => ({
        id: `q${i + 1}`,
        text: q.text,
        rationale: q.rationale,
        priority: q.priority,
        status: "ready" as const,
      }));

      return { summary: parsed.summary, questions };
    } catch (err) {
      throw new Error(`Paper analysis failed: ${(err as Error).message}`);
    }
  }

  /**
   * Detect whether the recent transcript indicates a Q&A session.
   * Uses the fallback (cheaper) model for speed and cost efficiency.
   *
   * Note: Q&A detection is factual classification — the session personality
   * is intentionally NOT applied here to avoid biasing the result.
   */
  async detectQA(
    recentTranscript: string,
  ): Promise<{ isQA: boolean; confidence: number }> {
    const systemPrompt = `You analyze meeting transcripts to detect when a Q&A session begins.
Given the last ~60 seconds of transcript, determine:
1. Is the speaker genuinely inviting questions from the audience? (Not rhetorical, not just pausing)
2. Your confidence (0.0 to 1.0)

Respond ONLY with a JSON object: { "isQA": true/false, "confidence": 0.0-1.0 }`;

    try {
      const saved = this.modelId;
      this.modelId = this.fallbackModelId;
      try {
        const raw = await this.converse(
          systemPrompt,
          `Recent transcript:\n\n${recentTranscript}`,
          { temperature: 0.2, maxTokens: 256 },
        );

        const parsed = JSON.parse(this.extractJSON(raw)) as {
          isQA: boolean;
          confidence: number;
        };

        return {
          isQA: Boolean(parsed.isQA),
          confidence: Number(parsed.confidence) || 0,
        };
      } finally {
        this.modelId = saved;
      }
    } catch (err) {
      console.error(`Q&A detection error: ${(err as Error).message}`);
      return { isQA: false, confidence: 0 };
    }
  }

  /**
   * Refine a prepared question based on the recent transcript context,
   * so it doesn't repeat what was already discussed and feels natural.
   *
   * @param originalQuestion   The prepared question text
   * @param recentTranscript   Last few minutes of transcript
   * @param sessionSystemPrompt  Per-session system prompt override
   * @param personality          Per-session personality settings
   */
  async refineQuestion(
    originalQuestion: string,
    recentTranscript: string,
    sessionSystemPrompt?: string,
    personality?: Personality,
  ): Promise<string> {
    let taskPrompt = `You are refining a prepared question for a live Q&A session.

Given:
- The original prepared question
- Recent transcript from the meeting

Refine the question so it:
1. Doesn't repeat something already discussed or answered
2. References specific points from the presentation when appropriate
3. Sounds natural and conversational (as if spoken aloud)
4. Stays concise (1-3 sentences max)

If the question has already been fully answered, respond with the original question but note it was covered — the operator can decide to skip it.`;

    // If a personality intro phrase is set, instruct the model to use it
    if (personality?.introPhrase) {
      taskPrompt += `\n\nStart the refined question with: "${personality.introPhrase}"`;
    }

    taskPrompt += `\n\nReturn ONLY the refined question text, nothing else.`;

    const systemPrompt = this.buildSystemPrompt(
      taskPrompt,
      sessionSystemPrompt,
      personality,
    );

    try {
      const refined = await this.converse(
        systemPrompt,
        `Original question: ${originalQuestion}\n\nRecent transcript:\n${recentTranscript.slice(-3000)}`,
        { temperature: 0.5 },
      );

      return refined.trim() || originalQuestion;
    } catch (err) {
      console.error(`Question refinement error: ${(err as Error).message}`);
      return originalQuestion;
    }
  }
}
