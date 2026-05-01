// ModPilot AI — Core TypeScript interfaces

export type RiskLevel = "low" | "medium" | "high" | "needs_review";

export type Category =
  | "Spam"
  | "Financial Promotion"
  | "Self Promotion"
  | "Low Effort"
  | "Formatting Issue"
  | "Needs Review";

export type SignalName =
  | "new_account"
  | "karma_farm"
  | "external_links"
  | "urgency_language"
  | "money_phrases"
  | "promo_phrases"
  | "no_flair"
  | "short_body"
  | "blacklisted_domain"
  | "all_caps";

export interface DetectedSignal {
  name: SignalName;
  label: string;
  weight: number;
}

export interface ScoringResult {
  score: number;
  riskLevel: RiskLevel;
  confidence: number;
  category: Category;
  signals: DetectedSignal[];
  autoHighRisk: boolean;
  aiSummary?: string;
  suggestedAction: string;
  suggestedReason: string;
  modNote: string;
}

export interface TriageItem {
  id: string;
  title: string;
  body: string;
  author: string;
  authorAge: number; // account age in days
  subreddit: string;
  url: string;
  permalink: string;
  numLinks: number;
  hasFlair: boolean;
  flairText: string | null;
  createdAt: number; // unix timestamp
  scoringResult: ScoringResult;
  status: "pending" | "approved" | "removed" | "warned" | "escalated" | "ignored";
}

export interface DecisionRecord {
  postId: string;
  title: string;
  author: string;
  riskLevel: RiskLevel;
  action: string;
  timestamp: number;
}

export interface SessionStats {
  reviewed: number;
  highRisk: number;
  escalated: number;
  actions: number;
  history: DecisionRecord[];
  timeSaved: number; // seconds
  suggestionAcceptanceRate: number; // 0–1
  // 7-day rolling window data (indexed by ISO date string)
  dailyReviewed: Record<string, number>;
  dailyHighRisk: Record<string, number>;
}

// ---------------------------------------------------------------------------
// HTTP API request / response types (WebView → Server)
// ---------------------------------------------------------------------------

export interface GetQueueResponse {
  type: "queue_data";
  items: TriageItem[];
  username: string;
  subreddit: string;
}

export interface TakeActionRequest {
  postId: string;
  action: "approve" | "remove" | "warn" | "escalate" | "ignore";
  modNote?: string;
  removalReason?: string;
  accepted_suggestion: boolean;
}

export interface TakeActionResponse {
  type: "action_complete";
  postId: string;
  action: string;
  success: boolean;
  error?: string;
}

export interface GetStatsResponse {
  type: "stats_data";
  stats: SessionStats;
}

// ---------------------------------------------------------------------------
// PreparedPost — intermediate type used by queueLoader before scoring
// ---------------------------------------------------------------------------

export interface PreparedPost {
  id: string;
  title: string;
  body: string;
  author: string;
  authorAge: number;
  subreddit: string;
  url: string;
  permalink: string;
  numLinks: number;
  hasFlair: boolean;
  flairText: string | null;
  createdAt: number;
}
