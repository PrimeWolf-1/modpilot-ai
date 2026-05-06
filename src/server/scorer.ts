// ModPilot AI — Signal Scoring Engine

import type {
  Category,
  DetectedSignal,
  PreparedPost,
  RiskLevel,
  ScoringResult,
  SignalName,
} from "../shared/types.ts";
import {
  SIGNAL_CONFIGS,
  THRESHOLDS,
  AUTO_HIGH_RISK_RULES,
  URGENCY_PHRASES,
  MONEY_PHRASES,
  PROMO_PHRASES,
  BLACKLISTED_DOMAINS,
} from "./scorerConfig.ts";

// Re-export thresholds for groq.ts (backwards-compatible)
export const THRESHOLD_HIGH = THRESHOLDS.high;
export const THRESHOLD_MEDIUM = THRESHOLDS.medium;

// ---------------------------------------------------------------------------
// Detection functions — one per signal, reading keywords from config
// ---------------------------------------------------------------------------

const SIGNAL_TESTS: Record<SignalName, (post: PreparedPost) => boolean> = {
  new_account:        (p) => p.authorAge < 30,
  karma_farm:         (p) => p.authorAge < 7,
  external_links:     (p) => p.numLinks >= 1,
  urgency_language:   (p) => containsAny(p.title + " " + p.body, URGENCY_PHRASES),
  money_phrases:      (p) => containsAny(p.title + " " + p.body, MONEY_PHRASES) || /\$\d+/.test(p.title + " " + p.body),
  promo_phrases:      (p) => containsAny(p.title + " " + p.body, PROMO_PHRASES),
  no_flair:           (p) => !p.hasFlair,
  short_body:         (p) => p.body.trim().length < 50,
  blacklisted_domain: (p) => containsAny(p.title + " " + p.body, BLACKLISTED_DOMAINS),
  all_caps:           (p) => p.title.length > 10 && p.title === p.title.toUpperCase(),
};

// ---------------------------------------------------------------------------
// AUTO_HIGH_RISK override conditions
// ---------------------------------------------------------------------------

function isAutoHighRisk(post: PreparedPost, signals: DetectedSignal[]): boolean {
  const signalNames = new Set(signals.map((s) => s.name));

  if (signalNames.has("blacklisted_domain")) return true;

  if (
    post.authorAge < AUTO_HIGH_RISK_RULES.maxAgeForPromoCombo &&
    (signalNames.has("money_phrases") || signalNames.has("promo_phrases"))
  ) return true;

  if (signals.length >= AUTO_HIGH_RISK_RULES.minSignalCount) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

function inferCategory(signals: DetectedSignal[], score: number): Category {
  const names = new Set(signals.map((s) => s.name));

  if (names.has("blacklisted_domain") || names.has("money_phrases")) return "Financial Promotion";
  if (names.has("promo_phrases") || names.has("external_links")) return "Self Promotion";
  if (names.has("urgency_language") || names.has("new_account") || names.has("karma_farm")) return "Spam";
  if (names.has("short_body") || names.has("all_caps")) return "Low Effort";
  if (names.has("no_flair")) return "Formatting Issue";
  if (score >= THRESHOLDS.high) return "Spam";
  return "Needs Review";
}

// ---------------------------------------------------------------------------
// Action suggestion
// ---------------------------------------------------------------------------

function suggestAction(
  riskLevel: RiskLevel,
  category: Category,
): { action: string; reason: string; modNote: string } {
  switch (riskLevel) {
    case "high":
      return {
        action: "Remove",
        reason: `Post flagged as high risk (${category}). Recommend removal per subreddit rules.`,
        modNote: `Removed: high-risk ${category} content detected by ModPilot AI.`,
      };
    case "medium":
      return {
        action: "Send Warning",
        reason: `Post flagged as medium risk (${category}). Consider warning the user.`,
        modNote: `Warning sent: ${category} content flagged by ModPilot AI.`,
      };
    case "needs_review":
      return {
        action: "Needs Review",
        reason: "Signals are ambiguous. Manual review recommended.",
        modNote: "Escalated for manual review by ModPilot AI.",
      };
    default:
      return {
        action: "Approve",
        reason: "No significant risk signals detected.",
        modNote: "",
      };
  }
}

// ---------------------------------------------------------------------------
// Main scorer — reads signal definitions from SIGNAL_CONFIGS
// ---------------------------------------------------------------------------

export function scorePost(post: PreparedPost): ScoringResult {
  const detectedSignals: DetectedSignal[] = [];
  let score = 0;

  for (const config of SIGNAL_CONFIGS) {
    const test = SIGNAL_TESTS[config.id];
    if (test && test(post)) {
      detectedSignals.push({ name: config.id, label: config.label, weight: config.weight });
      score += config.weight;
    }
  }

  const autoHighRisk = isAutoHighRisk(post, detectedSignals);

  let riskLevel: RiskLevel;
  if (autoHighRisk || score >= THRESHOLDS.high) {
    riskLevel = "high";
  } else if (score >= THRESHOLDS.medium) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  const effectiveScore = autoHighRisk ? Math.max(score, THRESHOLDS.high) : score;
  const confidence = Math.min(95, Math.round(effectiveScore * 1.2));
  const category = inferCategory(detectedSignals, effectiveScore);
  const { action, reason, modNote } = suggestAction(riskLevel, category);

  return {
    score: effectiveScore,
    riskLevel,
    confidence,
    category,
    signals: detectedSignals,
    autoHighRisk,
    suggestedAction: action,
    suggestedReason: reason,
    modNote,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function containsAny(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase));
}
