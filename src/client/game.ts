// ModPilot AI — Dashboard Main Entry Point (items 9-14)

import { requestExpandedMode } from "@devvit/web/client";
import { ApiEndpoint } from "../shared/api.ts";
import type { GetQueueResponse, GetStatsResponse, SessionStats, TriageItem } from "../shared/types.ts";
import { createCard } from "./card.ts";
import { openPanel, initPanel } from "./panel.ts";
import { updateMotivationBanner } from "./statsbar.ts";
import { openSummary } from "./summary.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let allItems: TriageItem[] = [];
let currentUsername = "";
let latestStats: SessionStats | null = null;
let activityPanelExpanded = false;

// ---------------------------------------------------------------------------
// Recent Actions log state
// ---------------------------------------------------------------------------

interface RecentActionEntry {
  action: string;
  author: string;
  riskLevel: string;
  timestamp: number;
  postId: string;
  title: string;
}

let recentActions: RecentActionEntry[] = [];

const ACTION_LOG_LABELS: Record<string, string> = {
  approve:  "Approved",
  remove:   "Removed",
  warn:     "Warned",
  escalate: "→ Needs Review",
  ignore:   "Ignored",
};

const RISK_LOG_LABELS: Record<string, string> = {
  high:         "High Risk",
  medium:       "Medium",
  low:          "Low Risk",
  needs_review: "Needs Review",
};

function addRecentAction(entry: RecentActionEntry): void {
  recentActions.unshift(entry);
  if (recentActions.length > 5) recentActions.length = 5;
  renderRecentActions();
  updateActivityBarLatest();
}

function updateActivityBarLatest(): void {
  const el = document.getElementById("activity-panel-latest");
  if (!el) return;
  if (recentActions.length === 0) {
    el.textContent = "";
    return;
  }
  const entry = recentActions[0]!;
  const label = ACTION_LOG_LABELS[entry.action] ?? entry.action;
  const author = entry.author.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  el.textContent = `· ${label} u/${author} · ${time}`;
}

function renderRecentActions(): void {
  const log = document.getElementById("activity-panel-entries");
  if (!log) return;

  if (recentActions.length === 0) {
    log.innerHTML = `<span class="ops-log-empty">No actions yet this session</span>`;
    return;
  }

  log.innerHTML = recentActions.map((entry) => {
    const label    = ACTION_LOG_LABELS[entry.action]    ?? entry.action;
    const riskLbl  = RISK_LOG_LABELS[entry.riskLevel]   ?? entry.riskLevel;
    const time     = new Date(entry.timestamp).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
    const author   = entry.author.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const postId   = entry.postId.replace(/"/g, "&quot;");
    return `<div class="ops-log-entry ${entry.riskLevel}" data-post-id="${postId}" role="button" tabindex="0"><span class="ops-log-dot"></span><span class="ops-log-action">${label}</span><span class="ops-log-author"> u/${author}</span><span class="ops-log-sep"> · </span><span class="ops-log-risk">${riskLbl}</span><span class="ops-log-time">${time}</span></div>`;
  }).join("");

  // Wire click handlers — re-open detail panel for the actioned item
  log.querySelectorAll<HTMLElement>(".ops-log-entry[data-post-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const postId = el.dataset.postId;
      if (!postId) return;
      const item = allItems.find((i) => i.id === postId);
      if (item) {
        if (activityPanelExpanded) toggleActivityBar();
        openPanel(item, onActionComplete);
      }
    });
  });
}

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

  renderRecentActions(); // show empty-state placeholder immediately

  // Wire refresh button
  document.getElementById("nav-refresh")?.addEventListener("click", () => {
    void loadQueue();
  });

  // Wire AI chip click → weekly summary panel (item 14)
  document.getElementById("nav-ai-chip")?.addEventListener("click", () => {
    if (latestStats) {
      openSummary(latestStats, currentUsername);
    }
  });

  // Wire focus mode toggle
  initFocusMode();

  // Wire activity bar toggle
  initActivityBar();

  // Hide risk icon img elements that fail to load (CSP-safe, no inline handlers)
  initRiskIconFallbacks();

  await Promise.all([loadQueue(), loadStats()]);
}

// =========================================================
// FOCUS MODE
// =========================================================

function initFocusMode(): void {
  const btn = document.getElementById("nav-focus");
  if (!btn) return;

  const stored = localStorage.getItem("modpilot-focus-mode");
  if (stored === "1") applyFocusMode(true, btn);

  btn.addEventListener("click", () => {
    const isActive = document.body.classList.contains("focus-mode");
    applyFocusMode(!isActive, btn);
  });
}

function applyFocusMode(on: boolean, btn: HTMLElement): void {
  document.body.classList.toggle("focus-mode", on);
  btn.classList.toggle("active", on);
  btn.setAttribute("aria-pressed", String(on));
  btn.title = on ? "Exit Operator Focus" : "Operator Focus";
  localStorage.setItem("modpilot-focus-mode", on ? "1" : "0");
}

// =========================================================
// ACTIVITY BAR
// =========================================================

function initActivityBar(): void {
  document.getElementById("activity-panel-toggle")?.addEventListener("click", toggleActivityBar);
}

function toggleActivityBar(): void {
  activityPanelExpanded = !activityPanelExpanded;

  const panel   = document.getElementById("activity-panel");
  const entries = document.getElementById("activity-panel-entries");
  const toggle  = document.getElementById("activity-panel-toggle");

  panel?.classList.toggle("expanded", activityPanelExpanded);
  toggle?.setAttribute("aria-expanded", String(activityPanelExpanded));
  entries?.setAttribute("aria-hidden", String(!activityPanelExpanded));
}

// =========================================================
// RISK ICON FALLBACKS
// =========================================================

function initRiskIconFallbacks(): void {
  document.querySelectorAll<HTMLImageElement>(".col-risk-icon").forEach((img) => {
    const hideIconAndSlot = () => {
      img.style.display = "none";
      const slot = img.closest<HTMLElement>(".col-icon-slot");
      if (slot) slot.style.display = "none";
    };
    img.addEventListener("error", hideIconAndSlot);
    // Image may have already failed (cached failure or instant 404)
    if (img.complete && img.naturalWidth === 0) hideIconAndSlot();
  });
}

// =========================================================
// QUEUE LOADING
// =========================================================

async function loadQueue(): Promise<void> {
  showLoading("Loading mod queue…");
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
  } catch (err) {
    console.error("loadQueue error:", err);
    showError("Failed to load queue. Check your connection.");
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
    updateMotivationBanner(data.stats);

    // Seed log from server history on first load (before any local actions)
    if (recentActions.length === 0 && data.stats.history.length > 0) {
      recentActions = data.stats.history.slice(0, 5).map((h) => ({
        action:    h.action,
        author:    h.author,
        riskLevel: h.riskLevel,
        timestamp: h.timestamp,
        postId:    h.postId,
        title:     h.title,
      }));
      renderRecentActions();
      updateActivityBarLatest();
    }
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
  const item = allItems.find((i) => i.id === postId);

  // Log BEFORE mutating state so we capture the original risk level
  if (item) {
    addRecentAction({
      action,
      author:    item.author,
      riskLevel: item.scoringResult.riskLevel,
      timestamp: Date.now(),
      postId:    item.id,
      title:     item.title,
    });
  }

  if (item) {
    if (action === "escalate") {
      item.scoringResult.riskLevel = "needs_review";
      // status stays "pending" — counted in needs_review column
    } else if (action === "warn") {
      // status stays "pending" — item remains in queue for follow-up
    } else {
      item.status = action === "approve" ? "approved"
        : action === "remove"  ? "removed"
        : "ignored";
    }
  }

  updateBadges();
  showActionToast(action, item);
  void loadStats();

  // Warn keeps the card in the queue — no auto-advance, no empty-state sync
  if (action !== "warn") {
    selectNextCard();
    const emptyStateDelay = action === "escalate" ? 260 : 460;
    setTimeout(syncColumnEmptyStates, emptyStateDelay);
  }
}

const RISK_PRIORITY = ["high", "medium", "low", "needs_review"] as const;

function selectNextCard(): void {
  for (const level of RISK_PRIORITY) {
    const next = allItems.find(
      (i) => i.status === "pending" && i.scoringResult.riskLevel === level,
    );
    if (next) {
      setTimeout(() => {
        // Only advance if the user hasn't manually selected something else
        if (!document.querySelector(".card.selected")) {
          openPanel(next, onActionComplete);
        }
      }, 500);
      return;
    }
  }
}

function pendingHighRiskCount(): number {
  return allItems.filter(
    (i) => i.status === "pending" && i.scoringResult.riskLevel === "high",
  ).length;
}

function syncColumnEmptyStates(): void {
  const pendingByRisk: Record<string, number> = { high: 0, medium: 0, low: 0, needs_review: 0 };
  for (const item of allItems) {
    if (item.status === "pending") {
      const k = item.scoringResult.riskLevel;
      if (k in pendingByRisk) pendingByRisk[k]!++;
    }
  }

  for (const [riskLevel, colId] of Object.entries(COLUMN_IDS)) {
    const colEl = document.getElementById(colId);
    if (!colEl) continue;
    const count = pendingByRisk[riskLevel] ?? 0;
    const emptyEl = colEl.querySelector<HTMLElement>(".col-empty");

    if (count > 0 && emptyEl) {
      emptyEl.remove();
    } else if (count === 0 && !emptyEl) {
      const div = document.createElement("div");
      div.className = "col-empty";
      div.innerHTML = `<div class="col-empty-icon">✓</div><span>No ${riskLevel.replace("_", " ")} items</span>`;
      colEl.appendChild(div);
    }
  }
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

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showActionToast(action: string, item?: TriageItem): void {
  const toast = document.getElementById("action-toast");
  if (!toast) return;

  const u = item ? ` — u/${item.author}` : "";
  const cat = item?.scoringResult.category ?? "";

  const text: Record<string, string> = {
    approve:  `✓ Approved${u}`,
    remove:   `✓ Removed${u}${cat ? ` — ${cat}` : ""}`,
    warn:     `✓ Warning sent${u}`,
    escalate: `✓ Escalated to Needs Review${u}`,
    ignore:   `— Ignored${u}`,
  };

  toast.textContent = text[action] ?? `✓ ${action}`;
  toast.className = `toast-${action} visible`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    toastTimer = null;
  }, 3000);
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
