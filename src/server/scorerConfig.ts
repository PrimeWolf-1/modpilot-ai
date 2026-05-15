// ModPilot AI — Modular Scoring Signal Config

import type { SignalName } from "../shared/types.ts";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export type SignalCategory = "account" | "financial" | "promotional" | "quality" | "blacklist";

export interface SignalConfig {
  id: SignalName;
  label: string;
  description: string;
  weight: number;
  category: SignalCategory;
  keywords?: string[];
}

// ---------------------------------------------------------------------------
// Phrase banks — referenced by signal configs and scorer test functions
// ---------------------------------------------------------------------------

export const URGENCY_PHRASES: string[] = [
  "act now", "limited time", "don't miss", "last chance",
  "expires soon", "hurry", "today only", "while supplies last",
  "urgent", "immediately",
];

export const MONEY_PHRASES: string[] = [
  "earn money", "make money", "passive income", "get rich",
  "financial freedom", "invest now", "guaranteed return", "risk-free",
  "double your", "crypto", "bitcoin", "nft", "forex",
  "trading signals", "pump", "100x",
];

export const PROMO_PHRASES: string[] = [
  "check out my", "follow me", "subscribe", "my channel",
  "my discord", "join my", "join now", "use my code",
  "use code", "referral", "affiliate", "sponsored",
  "paid partnership", "dm me", "dm for", "free trial", "sign up",
];

export const BLACKLISTED_DOMAINS: string[] = [
  "onlyfans", "patreon.com/", "t.me/", "cashapp",
  "venmo", "paypal.me", "bit.ly", "tinyurl",
  "gofundme", "kickstarter",
];

// ---------------------------------------------------------------------------
// Signal definitions
// ---------------------------------------------------------------------------

export const SIGNAL_CONFIGS: SignalConfig[] = [
  {
    id: "new_account",
    label: "New Account",
    description: "Account created less than 30 days ago — higher likelihood of throwaway or bot.",
    weight: 20,
    category: "account",
  },
  {
    id: "karma_farm",
    label: "Low Karma Indicator",
    description: "Account is fewer than 7 days old, suggesting possible karma farming or bot activity.",
    weight: 15,
    category: "account",
  },
  {
    id: "external_links",
    label: "External Links",
    description: "Post contains one or more external links — common in spam and phishing posts.",
    weight: 15,
    category: "promotional",
  },
  {
    id: "urgency_language",
    label: "Urgency Language",
    description: "Post uses urgency-inducing phrases to pressure readers into clicking or acting.",
    weight: 10,
    category: "promotional",
    keywords: URGENCY_PHRASES,
  },
  {
    id: "money_phrases",
    label: "Money / Financial Language",
    description: "Post contains financial promotion or get-rich-quick language.",
    weight: 20,
    category: "financial",
    keywords: MONEY_PHRASES,
  },
  {
    id: "promo_phrases",
    label: "Promotional Language",
    description: "Post uses self-promotional phrases or referral/affiliate language.",
    weight: 15,
    category: "promotional",
    keywords: PROMO_PHRASES,
  },
  {
    id: "no_flair",
    label: "Missing Flair",
    description: "Post is missing required flair, suggesting a new or inattentive user.",
    weight: 5,
    category: "quality",
  },
  {
    id: "short_body",
    label: "Low-Effort Post",
    description: "Post body is fewer than 50 characters — often low-quality or spam bait.",
    weight: 10,
    category: "quality",
  },
  {
    id: "blacklisted_domain",
    label: "Blacklisted Domain",
    description: "Post links to or mentions a domain on the platform's blocklist.",
    weight: 30,
    category: "blacklist",
    keywords: BLACKLISTED_DOMAINS,
  },
  {
    id: "all_caps",
    label: "All-Caps Title",
    description: "Post title is written entirely in uppercase — common in rage-bait and spam.",
    weight: 8,
    category: "quality",
  },
];

// ---------------------------------------------------------------------------
// Scoring thresholds
// ---------------------------------------------------------------------------

export const THRESHOLDS = {
  high: 55,
  medium: 25,
} as const;

// ---------------------------------------------------------------------------
// Auto-high-risk rule parameters
// ---------------------------------------------------------------------------

export const AUTO_HIGH_RISK_RULES = {
  minSignalCount: 4,
  maxAgeForPromoCombo: 7,
} as const;
