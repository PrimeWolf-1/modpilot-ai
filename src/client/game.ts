// ModPilot AI — Dashboard Main Entry Point (items 9-14)

import { requestExpandedMode } from "@devvit/web/client";
import { ApiEndpoint } from "../shared/api.ts";
import type { GetQueueResponse, GetStatsResponse, SessionStats, TriageItem } from "../shared/types.ts";
import { createCard } from "./card.ts";
import { openPanel, initPanel } from "./panel.ts";
import { updateStatsBar, updateQueueCount, setStatus } from "./statsbar.ts";
import { openSummary } from "./summary.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let allItems: TriageItem[] = [];
let currentUsername = "";
let latestStats: SessionStats | null = null;

// =========================================================
// COLUMN MAPPING
// =========================================================

const COLUMN_IDS: Record<string, string> = {
  high: "cards-high",
  medium: "cards-medium",
  low: "cards-low",
  needs_review: "cards-review",
};

const BADGE_IDS: Record<string, string> = {
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low",
  needs_review: "badge-review",
};

// =========================================================
// INIT
// =========================================================

async function init(): Promise<void> {
  // Wire panel close + action callbacks
  initPanel(() => { /* no-op after close */ });

  // Wire refresh button
  document.getElementById("nav-refresh")?.addEventListener("click", () => {
    void loadQueue();
  });

  // Wire AI chip click → weekly summary panel (item 14)
  document.getElementById("nav-ai-chip")?.addEventListener("click", () => {
    if (latestStats) {
      openSummary(latestStats, currentUsername);
    } else {
      setStatus("Loading stats…", 2000);
    }
  });

  await Promise.all([loadQueue(), loadStats()]);
}

// =========================================================
// QUEUE LOADING
// =========================================================

async function loadQueue(): Promise<void> {
  showLoading("Loading mod queue…");
  setStatus("reviewing signals…");
  setRefreshSpinning(true);

  try {
    const resp = await fetch(ApiEndpoint.Queue);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = (await resp.json()) as GetQueueResponse;
    allItems = data.items;
    currentUsername = data.username;

    // Update nav
    const subredditEl = document.getElementById("nav-subreddit");
    if (subredditEl && data.subreddit) {
      subredditEl.textContent = `r/${data.subreddit}`;
    }

    const aiLabel = document.getElementById("nav-ai-label");
    if (aiLabel && data.username) {
      aiLabel.textContent = `${data.username} AI active`;
    }

    renderQueue(allItems);
    updateQueueCount(allItems.length);
    setStatus("analysis complete", 4000);
  } catch (err) {
    console.error("loadQueue error:", err);
    showError("Failed to load queue. Check your connection.");
    setStatus("queue load failed");
  } finally {
    hideLoading();
    setRefreshSpinning(false);
  }
}

async function loadStats(): Promise<void> {
  try {
    const resp = await fetch(ApiEndpoint.Stats);
    if (!resp.ok) return;
    const data = (await resp.json()) as GetStatsResponse;
    latestStats = data.stats;
    updateStatsBar(data.stats, currentUsername);
  } catch (err) {
    console.error("loadStats error:", err);
  }
}

// =========================================================
// RENDER
// =========================================================

function renderQueue(items: TriageItem[]): void {
  // Clear all columns
  for (const colId of Object.values(COLUMN_IDS)) {
    const el = document.getElementById(colId);
    if (el) el.innerHTML = "";
  }

  // Group by risk level
  const groups: Record<string, TriageItem[]> = {
    high: [],
    medium: [],
    low: [],
    needs_review: [],
  };

  for (const item of items) {
    if (item.status !== "pending") continue;
    const key = item.scoringResult.riskLevel;
    (groups[key] ?? (groups["needs_review"] ??= [])).push(item);
  }

  // Render each group with staggered animation
  let globalDelay = 0;
  for (const [riskLevel, groupItems] of Object.entries(groups)) {
    const colId = COLUMN_IDS[riskLevel];
    const badgeId = BADGE_IDS[riskLevel];
    if (!colId || !badgeId) continue;

    const colEl = document.getElementById(colId);
    const badgeEl = document.getElementById(badgeId);

    if (badgeEl) badgeEl.textContent = String(groupItems.length);

    if (!colEl) continue;

    if (groupItems.length === 0) {
      colEl.innerHTML = `
        <div class="col-empty">
          <div class="col-empty-icon">✓</div>
          <span>No ${riskLevel.replace("_", " ")} items</span>
        </div>`;
      continue;
    }

    for (const item of groupItems) {
      const card = createCard(item, (clickedItem) => {
        openPanel(clickedItem, onActionComplete);
      });
      // Stagger card animations
      card.style.animationDelay = `${globalDelay * 40}ms`;
      colEl.appendChild(card);
      globalDelay++;
    }
  }
}

// =========================================================
// ACTION COMPLETE CALLBACK
// =========================================================

function onActionComplete(postId: string, action: string, _accepted: boolean): void {
  // Mark item as no longer pending in local state
  const item = allItems.find((i) => i.id === postId);
  if (item) {
    item.status = action === "approve"
      ? "approved"
      : action === "remove"
      ? "removed"
      : action === "warn"
      ? "warned"
      : action === "escalate"
      ? "escalated"
      : "ignored";
  }

  // Update badges
  updateBadges();

  // Reload stats to reflect changes
  void loadStats();
}

function updateBadges(): void {
  const groups: Record<string, number> = {
    high: 0, medium: 0, low: 0, needs_review: 0,
  };
  for (const item of allItems) {
    if (item.status === "pending") {
      const key = item.scoringResult.riskLevel;
      if (key in groups) (groups as Record<string, number>)[key]!++;
    }
  }

  for (const [riskLevel, count] of Object.entries(groups)) {
    const badgeId = BADGE_IDS[riskLevel];
    if (badgeId) {
      const el = document.getElementById(badgeId);
      if (el) el.textContent = String(count);
    }
  }

  updateQueueCount(allItems.filter((i) => i.status === "pending").length);
}

// =========================================================
// UI UTILITIES
// =========================================================

function showLoading(text: string): void {
  const overlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");
  if (loadingText) loadingText.textContent = text;
  overlay?.classList.remove("hidden");
}

function hideLoading(): void {
  const overlay = document.getElementById("loading-overlay");
  overlay?.classList.add("hidden");
}

function showError(msg: string): void {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.add("visible");
  setTimeout(() => banner.classList.remove("visible"), 5000);
}

function setRefreshSpinning(spinning: boolean): void {
  const btn = document.getElementById("nav-refresh");
  if (spinning) {
    btn?.classList.add("spinning");
  } else {
    btn?.classList.remove("spinning");
  }
}

// =========================================================
// ENTRYPOINT — called from splash.ts via requestExpandedMode
// or directly when game.html is the initial view
// =========================================================

// requestExpandedMode is used by splash.ts; game.html initializes directly
void init();

// Export for splash.ts to call if needed
export { requestExpandedMode };
