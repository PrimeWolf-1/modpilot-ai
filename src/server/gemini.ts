// ModPilot AI — Gemini API Integration (AI Summary only)

import type { ScoringResult } from "../shared/types.ts";
import { THRESHOLD_MEDIUM } from "./scorer.ts";
import { GEMINI_API_KEY } from "./secrets.ts";

const MODEL = "gemini-1.5-flash";

export function shouldAnalyzeWithGemini(score: number): boolean {
  return score >= THRESHOLD_MEDIUM;
}

export function buildFallbackSummary(scoring: Omit<ScoringResult, "aiSummary">): string {
  const signalLabels = scoring.signals.map((s) => s.label).join(", ") || "general risk patterns";
  return `This post was flagged for ${signalLabels}. These signals are consistent with ${scoring.category} content that may violate community rules.`;
}

function buildPrompt(signals: string[], riskLevel: string, confidence: number): string {
  const signalList = signals.join(", ") || "none detected";
  return `You are a Reddit moderation assistant. A post has been flagged with these signals: ${signalList}. Risk level: ${riskLevel}. Confidence: ${confidence}%. Write 2 sentences in plain language explaining why this post may violate community rules. Be specific about the signals detected.`;
}

export async function analyzeWithGemini(
  scoring: Omit<ScoringResult, "aiSummary">,
): Promise<string | null> {
  if (!shouldAnalyzeWithGemini(scoring.score)) return null;

  if (!GEMINI_API_KEY) {
    console.warn("gemini.ts: GEMINI_API_KEY not set in secrets.ts — using rule-based summary");
    return null;
  }

  const signals = scoring.signals.map((s) => s.label);
  const prompt = buildPrompt(signals, scoring.riskLevel, scoring.confidence);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.3 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`Gemini API error ${response.status}: ${errText}`);
      return null;
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return text.trim() || null;
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(
      isTimeout
        ? "Gemini request timed out after 10s"
        : `Gemini API call failed: ${err}`,
    );
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
