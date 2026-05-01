// ModPilot AI — Claude API Integration

import { settings } from "@devvit/web/server";
import type { Category, PreparedPost, ScoringResult } from "../shared/types.ts";
import { THRESHOLD_MEDIUM } from "./scorer.ts";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 300;

// ---------------------------------------------------------------------------
// Guard: only fire for medium and high risk items
// ---------------------------------------------------------------------------

export function shouldAnalyzeWithClaude(score: number): boolean {
  return score >= THRESHOLD_MEDIUM;
}

// ---------------------------------------------------------------------------
// Claude analysis result
// ---------------------------------------------------------------------------

interface ClaudeAnalysis {
  summary: string;
  category: Category;
  confidence_adjustment: number;
}

const VALID_CATEGORIES: Category[] = [
  "Spam",
  "Financial Promotion",
  "Self Promotion",
  "Low Effort",
  "Formatting Issue",
  "Needs Review",
];

function validateCategory(value: unknown): Category | null {
  if (
    typeof value === "string" &&
    VALID_CATEGORIES.includes(value as Category)
  ) {
    return value as Category;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  post: PreparedPost,
  scoring: Omit<ScoringResult, "aiSummary">,
): string {
  const signals =
    scoring.signals.map((s) => s.label).join(", ") || "none detected";
  const body = post.body.trim().slice(0, 500) || "(no body text)";

  return `You are a Reddit moderator assistant. Analyze this queued post and respond with ONLY valid JSON — no markdown fences, no explanation.

POST:
Title: ${post.title}
Body: ${body}
Author account age: ${post.authorAge} days old
Detected signals: ${signals}
Rule-based risk score: ${scoring.score} (${scoring.riskLevel} risk)

Return ONLY this JSON object:
{
  "summary": "<1-2 sentence plain English explanation of the specific risk in this post>",
  "category": "<exactly one of: Spam, Financial Promotion, Self Promotion, Low Effort, Formatting Issue, Needs Review>",
  "confidence_adjustment": <integer from -10 to 10, positive if you agree with the risk assessment>
}`;
}

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

export async function analyzeWithClaude(
  post: PreparedPost,
  scoring: Omit<ScoringResult, "aiSummary">,
): Promise<{ summary: string; category: Category } | null> {
  if (!shouldAnalyzeWithClaude(scoring.score)) return null;

  let apiKey: string | undefined;
  try {
    apiKey = await settings.get<string>("ANTHROPIC_API_KEY");
  } catch {
    console.warn("claude.ts: failed to read ANTHROPIC_API_KEY from settings");
    return null;
  }

  if (!apiKey) {
    console.warn("claude.ts: ANTHROPIC_API_KEY not configured");
    return null;
  }

  const prompt = buildPrompt(post, scoring);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`Claude API error ${response.status}: ${errText}`);
      return null;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";

    // Strict JSON-only parsing — extract first JSON object from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Claude response contained no JSON:", text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ClaudeAnalysis>;

    if (!parsed.summary || !parsed.category) return null;

    return {
      summary: parsed.summary,
      category: validateCategory(parsed.category) ?? scoring.category,
    };
  } catch (err) {
    // Fallback to rule-based result — never block the UI
    console.error("Claude API call failed, falling back to rule-based:", err);
    return null;
  }
}
