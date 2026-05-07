// ModPilot AI — Groq API Integration

import type { Category, PreparedPost, ScoringResult } from "../shared/types.ts";
import { THRESHOLD_MEDIUM } from "./scorer.ts";
import { settings } from "@devvit/web/server";

const MODEL = "llama3-70b-8192";
const MAX_TOKENS = 300;

// ---------------------------------------------------------------------------
// Guard: only fire for medium and high risk items
// ---------------------------------------------------------------------------

export function shouldAnalyzeWithGroq(score: number): boolean {
  return score >= THRESHOLD_MEDIUM;
}

// ---------------------------------------------------------------------------
// Groq analysis result
// ---------------------------------------------------------------------------

interface GroqAnalysis {
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

export async function analyzeWithGroq(
  post: PreparedPost,
  scoring: Omit<ScoringResult, "aiSummary">,
): Promise<{ summary: string; category: Category } | null> {
  if (!shouldAnalyzeWithGroq(scoring.score)) return null;

  const GROQ_API_KEY = (await settings.get<string>("GROQ_API_KEY")) ?? "";
  if (!GROQ_API_KEY) {
    console.warn("groq.ts: GROQ_API_KEY not configured in Devvit settings");
    return null;
  }

  const prompt = buildPrompt(post, scoring);
  const fallback = { summary: "Threat classified using weighted moderation signal analysis.", category: scoring.category };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    console.log("Groq fetch starting");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    console.log(`Groq status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`Groq API error ${response.status}: ${errText}`);
      return fallback;
    }

    const text = await response.text();
    console.log("Groq raw response:", text.slice(0, 500));

    const data = JSON.parse(text) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Groq response contained no JSON:", content.slice(0, 200));
      return fallback;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<GroqAnalysis>;

    if (!parsed.summary || !parsed.category) return fallback;

    return {
      summary: parsed.summary,
      category: validateCategory(parsed.category) ?? scoring.category,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(isTimeout ? "Groq request timed out after 10s" : `Groq API call failed: ${err}`);
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}
