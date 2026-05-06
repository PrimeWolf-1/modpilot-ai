// ModPilot AI — Signal Scoring Engine

import type {
  Category,
  DetectedSignal,
  PreparedPost,
  RiskLevel,
  ScoringResult,
  SignalName,
} from "../shared/types.ts";

// ---------------------------------------------------------------------------
// Signal definitions
// ---------------------------------------------------------------------------

interface SignalDefinition {
  name: SignalName;
  label: string;
  weight: number;
  test: (post: PreparedPost) => boolean;
}

const SIGNALS: SignalDefinition[] = [
  {
    name: "new_account",
    label: "New Account",
    weight: 20,
    test: (p) => p.authorAge < 30,
  },
  {
    name: "karma_farm",
    label: "Low Karma Indicator",
    weight: 15,
    test: (p) => p.authorAge < 7,
  },
  {
    name: "external_links",
    label: "External Links",
    weight: 15,
    test: (p) => p.numLinks >= 1,
  },
  {
    name: "urgency_language",
    label: "Urgency Language",
    weight: 10,
    test: (p) => containsAny(p.title + " " + p.body, URGENCY_PHRASES),
  },
  {
    name: "money_phrases",
    label: "Money / Financial Language",
    weight: 20,
    test: (p) => containsAny(p.title + " " + p.body, MONEY_PHRASES) || /\$\d+/.test(p.title + " " + p.body),
  },
  {
    name: "promo_phrases",
    label: "Promotional Language",
    weight: 15,
    test: (p) => containsAny(p.title + " " + p.body, PROMO_PHRASES),
  },
  {
    name: "no_flair",
    label: "Missing Flair",
    weight: 5,
    test: (p) => !p.hasFlair,
  },
  {
    name: "short_body",
    label: "Low-Effort Post",
    weight: 10,
    test: (p) => p.body.trim().length < 50,
  },
  {
    name: "blacklisted_domain",
    label: "Blacklisted Domain",
    weight: 30,
    test: (p) => containsAny(p.title + " " + p.body, BLACKLIST),
  },
  {
    name: "all_caps",
    label: "All-Caps Title",
    weight: 8,
    test: (p) => p.title.length > 10 && p.title === p.title.toUpperCase(),
  },
];

// ---------------------------------------------------------------------------
// Phrase arrays
// ---------------------------------------------------------------------------

const URGENCY_PHRASES = [
  "act now",
  "limited time",
  "don't miss",
  "last chance",
  "expires soon",
  "hurry",
  "today only",
  "while supplies last",
  "urgent",
  "immediately",
];

const MONEY_PHRASES = [
  "earn money",
  "make money",
  "passive income",
  "get rich",
  "financial freedom",
  "invest now",
  "guaranteed return",
  "risk-free",
  "double your",
  "crypto",
  "bitcoin",
  "nft",
  "forex",
  "trading signals",
  "pump",
  "100x",
];

const PROMO_PHRASES = [
  "check out my",
  "follow me",
  "subscribe",
  "my channel",
  "my discord",
  "join my",
  "join now",
  "use my code",
  "use code",
  "referral",
  "affiliate",
  "sponsored",
  "paid partnership",
  "dm me",
  "dm for",
  "free trial",
  "sign up",
];

const BLACKLIST = [
  "onlyfans",
  "patreon.com/",
  "t.me/",
  "cashapp",
  "venmo",
  "paypal.me",
  "bit.ly",
  "tinyurl",
  "gofundme",
  "kickstarter",
];

// ---------------------------------------------------------------------------
// Score thresholds (exported for use in groq.ts)
// ---------------------------------------------------------------------------

export const THRESHOLD_HIGH = 55;
export const THRESHOLD_MEDIUM = 25;

// ---------------------------------------------------------------------------
// AUTO_HIGH_RISK override conditions
// ---------------------------------------------------------------------------

function isAutoHighRisk(post: PreparedPost, signals: DetectedSignal[]): boolean {
  const signalNames = new Set(signals.map((s) => s.name));

  // 1. Blacklisted domain present
  if (signalNames.has("blacklisted_domain")) return true;

  // 2. New account (<7 days) AND money/promo language
  if (post.authorAge < 7 && (signalNames.has("money_phrases") || signalNames.has("promo_phrases")))
    return true;

  // 3. 3+ signals triggered simultaneously
  if (signals.length >= 3) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

function inferCategory(signals: DetectedSignal[], score: number): Category {
  const names = new Set(signals.map((s) => s.name));

  if (names.has("blacklisted_domain") || names.has("money_phrases")) {
    return "Financial Promotion";
  }
  if (names.has("promo_phrases") || names.has("external_links")) {
    return "Self Promotion";
  }
  if (names.has("urgency_language") || names.has("new_account") || names.has("karma_farm")) {
    return "Spam";
  }
  if (names.has("short_body") || names.has("all_caps")) {
    return "Low Effort";
  }
  if (names.has("no_flair")) {
    return "Formatting Issue";
  }
  if (score >= THRESHOLD_HIGH) {
    return "Spam";
  }
  return "Needs Review";
}

// ---------------------------------------------------------------------------
// Action suggestion
// ---------------------------------------------------------------------------

function suggestAction(riskLevel: RiskLevel, category: Category): { action: string; reason: string; modNote: string } {
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
// Main scorer
// ---------------------------------------------------------------------------

export function scorePost(post: PreparedPost): ScoringResult {
  // Sequential accumulation
  const detectedSignals: DetectedSignal[] = [];
  let score = 0;

  for (const signal of SIGNALS) {
    if (signal.test(post)) {
      detectedSignals.push({
        name: signal.name,
        label: signal.label,
        weight: signal.weight,
      });
      score += signal.weight;
    }
  }

  const autoHighRisk = isAutoHighRisk(post, detectedSignals);

  // Determine risk level
  let riskLevel: RiskLevel;
  if (autoHighRisk || score >= THRESHOLD_HIGH) {
    riskLevel = "high";
  } else if (score >= THRESHOLD_MEDIUM) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // If auto-override, bump score to at least threshold
  const effectiveScore = autoHighRisk ? Math.max(score, THRESHOLD_HIGH) : score;

  // Confidence: min(95, score * 1.2)
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
