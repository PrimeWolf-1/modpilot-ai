// ModPilot AI — KV Store and Session Stats

import { redis } from "@devvit/web/server";
import type { DecisionRecord, SessionStats } from "../shared/types.ts";

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

const KEYS = {
  reviewed: "modpilot:reviewed",
  highRisk: "modpilot:high_risk",
  escalated: "modpilot:escalated",
  actions: "modpilot:actions",
  history: "modpilot:history",
  dailyReviewed: (date: string) => `modpilot:daily:${date}:reviewed`,
  dailyHighRisk: (date: string) => `modpilot:daily:${date}:high_risk`,
} as const;

const HISTORY_CAP = 50;
const ROLLING_WINDOW_DAYS = 7;
const TIME_SAVED_PER_HIGH_RISK_SECONDS = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

/**
 * Converts seconds into a human-readable "X hr Y min" display string.
 */
export function formatTimeSaved(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

export async function incrementReviewed(): Promise<void> {
  const today = todayISO();
  await Promise.all([
    redis.incrBy(KEYS.reviewed, 1),
    redis.incrBy(KEYS.dailyReviewed(today), 1),
  ]);
}

export async function incrementHighRisk(): Promise<void> {
  const today = todayISO();
  await Promise.all([
    redis.incrBy(KEYS.highRisk, 1),
    redis.incrBy(KEYS.dailyHighRisk(today), 1),
  ]);
}

export async function incrementEscalated(): Promise<void> {
  await redis.incrBy(KEYS.escalated, 1);
}

export async function incrementActions(): Promise<void> {
  await redis.incrBy(KEYS.actions, 1);
}

/**
 * Appends a decision to the rolling 50-item history, evicting oldest entries.
 */
export async function appendDecision(record: DecisionRecord): Promise<void> {
  const raw = await redis.get(KEYS.history);
  const history: DecisionRecord[] = raw ? (JSON.parse(raw) as DecisionRecord[]) : [];
  history.unshift(record);
  if (history.length > HISTORY_CAP) {
    history.length = HISTORY_CAP;
  }
  await redis.set(KEYS.history, JSON.stringify(history));
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getStats(): Promise<SessionStats> {
  // Fetch base counters in parallel
  const [reviewedRaw, highRiskRaw, escalatedRaw, actionsRaw, historyRaw] =
    await Promise.all([
      redis.get(KEYS.reviewed),
      redis.get(KEYS.highRisk),
      redis.get(KEYS.escalated),
      redis.get(KEYS.actions),
      redis.get(KEYS.history),
    ]);

  const reviewed = Number(reviewedRaw ?? 0);
  const highRisk = Number(highRiskRaw ?? 0);
  const escalated = Number(escalatedRaw ?? 0);
  const actions = Number(actionsRaw ?? 0);
  const history: DecisionRecord[] = historyRaw
    ? (JSON.parse(historyRaw) as DecisionRecord[])
    : [];

  // Build 7-day rolling window date keys
  const today = new Date();
  const dateKeys: string[] = [];
  for (let i = 0; i < ROLLING_WINDOW_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateKeys.push(d.toISOString().split("T")[0]!);
  }

  // Batch-fetch all daily counters
  const dailyValues = await Promise.all(
    dateKeys.flatMap((date) => [
      redis.get(KEYS.dailyReviewed(date)),
      redis.get(KEYS.dailyHighRisk(date)),
    ]),
  );

  const dailyReviewed: Record<string, number> = {};
  const dailyHighRisk: Record<string, number> = {};
  dateKeys.forEach((date, i) => {
    dailyReviewed[date] = Number(dailyValues[i * 2] ?? 0);
    dailyHighRisk[date] = Number(dailyValues[i * 2 + 1] ?? 0);
  });

  // Suggestion acceptance rate: actions that were not "ignored" / total history
  const acceptedCount = history.filter((r) => r.action !== "ignored").length;
  const suggestionAcceptanceRate =
    history.length > 0 ? acceptedCount / history.length : 0;

  const timeSaved = highRisk * TIME_SAVED_PER_HIGH_RISK_SECONDS;

  return {
    reviewed,
    highRisk,
    escalated,
    actions,
    history,
    timeSaved,
    suggestionAcceptanceRate,
    dailyReviewed,
    dailyHighRisk,
  };
}
