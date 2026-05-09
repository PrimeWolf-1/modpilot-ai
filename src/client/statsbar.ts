// ModPilot AI — Stats Bar

import type { SessionStats } from "../shared/types.ts";

let statusTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Updates the stats bar DOM with current session stats.
 * Animates numbers that change.
 */
export function updateStatsBar(stats: SessionStats, username: string): void {
  animateStat("stat-reviewed", stats.reviewed);
  animateStat("stat-high-risk", stats.highRisk);

  const timeSavedEl = document.getElementById("stat-time-saved");
  if (timeSavedEl) {
    timeSavedEl.textContent = formatTimeSaved(stats.timeSaved);
  }

  // Update AI chip label
  const aiLabel = document.getElementById("nav-ai-label");
  if (aiLabel && username) {
    aiLabel.textContent = `${username} AI active`;
  }
}

/**
 * Updates the queue count stat (total items loaded).
 */
export function updateQueueCount(count: number): void {
  const el = document.getElementById("stat-queue-count");
  if (el) {
    animateStat("stat-queue-count", count);
  }
}

/**
 * Sets the status message in the stats bar.
 * Optionally auto-clears after `clearAfterMs` ms.
 */
export function setStatus(message: string, clearAfterMs?: number): void {
  const el = document.getElementById("stat-status");
  if (!el) return;
  el.textContent = message;

  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }
  if (clearAfterMs !== undefined) {
    statusTimeout = setTimeout(() => {
      el.textContent = "";
    }, clearAfterMs);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function animateStat(id: string, newValue: number): void {
  const el = document.getElementById(id);
  if (!el) return;

  const current = parseInt(el.textContent ?? "0", 10) || 0;
  if (current === newValue) return;

  el.textContent = String(newValue);
  el.classList.remove("pop");
  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add("pop");
  setTimeout(() => el.classList.remove("pop"), 400);
}

function formatTimeSaved(seconds: number): string {
  if (seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/**
 * Updates the High Risk stat display directly (for immediate client-side refresh).
 */
export function setHighRiskStat(count: number): void {
  animateStat("stat-high-risk", count);
}
