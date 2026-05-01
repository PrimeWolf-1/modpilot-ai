// ModPilot AI — Weekly Summary Panel (item 14)

import type { SessionStats, DecisionRecord, SignalName, Category } from "../shared/types.ts";

let isOpen = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Renders and opens the weekly summary overlay with current stats. */
export function openSummary(stats: SessionStats, username: string): void {
  if (isOpen) {
    closeSummary();
    return;
  }

  const overlay = getOrCreateOverlay();
  populateSummary(overlay, stats, username);
  overlay.classList.add("open");
  isOpen = true;
}

export function closeSummary(): void {
  const overlay = document.getElementById("summary-overlay");
  overlay?.classList.remove("open");
  isOpen = false;
}

// ---------------------------------------------------------------------------
// Overlay creation (inserted once into the DOM)
// ---------------------------------------------------------------------------

function getOrCreateOverlay(): HTMLElement {
  const existing = document.getElementById("summary-overlay");
  if (existing) return existing;

  const overlay = document.createElement("div");
  overlay.id = "summary-overlay";
  overlay.className = "summary-overlay";
  overlay.innerHTML = `
    <div class="summary-panel" id="summary-panel">
      <div class="summary-header">
        <div class="summary-title">Weekly Activity Summary</div>
        <button class="summary-close" id="summary-close">✕</button>
      </div>
      <div class="summary-body" id="summary-body"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSummary();
  });

  document.getElementById("summary-close")?.addEventListener("click", closeSummary);

  return overlay;
}

// ---------------------------------------------------------------------------
// Data population
// ---------------------------------------------------------------------------

function populateSummary(
  overlay: HTMLElement,
  stats: SessionStats,
  username: string,
): void {
  const body = overlay.querySelector<HTMLElement>("#summary-body");
  if (!body) return;

  const acceptPct = Math.round(stats.suggestionAcceptanceRate * 100);
  const trend = computeTrend(stats.dailyReviewed);

  body.innerHTML = `
    <!-- Weekly stats grid -->
    <div class="sum-section">
      <div class="sum-section-label">This Period</div>
      <div class="sum-stats-grid">
        ${statBox("Reviewed", stats.reviewed, "")}
        ${statBox("High Risk", stats.highRisk, "high")}
        ${statBox("Escalated", stats.escalated, "review")}
        ${statBox("Time Saved", formatTimeSaved(stats.timeSaved), "ai")}
      </div>
    </div>

    <!-- 7-day bar chart -->
    <div class="sum-section">
      <div class="sum-section-label">7-Day Activity</div>
      <div class="sum-chart" id="sum-chart">
        ${buildBarChart(stats.dailyReviewed, stats.dailyHighRisk)}
      </div>
      <div class="sum-trend ${trend.up ? "trend-up" : "trend-down"}">
        ${trend.up ? "▲" : "▼"} ${trend.label}
      </div>
    </div>

    <!-- Top signals from history -->
    <div class="sum-section">
      <div class="sum-section-label">Most Common Signals</div>
      <div class="sum-list">
        ${buildSignalList(stats.history)}
      </div>
    </div>

    <!-- Top categories -->
    <div class="sum-section">
      <div class="sum-section-label">Top Risk Categories</div>
      <div class="sum-list">
        ${buildCategoryList(stats.history)}
      </div>
    </div>

    <!-- Acceptance rate -->
    <div class="sum-section">
      <div class="sum-section-label">Suggestion Acceptance</div>
      <div class="sum-acceptance">
        <div class="sum-acceptance-bar">
          <div class="sum-acceptance-fill" style="width: ${acceptPct}%"></div>
        </div>
        <div class="sum-acceptance-pct">${acceptPct}%</div>
      </div>
      <div class="sum-acceptance-note">of ModPilot AI suggestions were accepted by ${username || "you"}</div>
    </div>

    <!-- Decision history -->
    <div class="sum-section">
      <div class="sum-section-label">Recent Decisions (last ${stats.history.length})</div>
      <div class="sum-history">
        ${buildHistoryList(stats.history)}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function statBox(label: string, value: string | number, colorClass: string): string {
  return `
    <div class="sum-stat-box">
      <div class="sum-stat-value ${colorClass}">${value}</div>
      <div class="sum-stat-label">${label}</div>
    </div>`;
}

function buildBarChart(
  dailyReviewed: Record<string, number>,
  dailyHighRisk: Record<string, number>,
): string {
  const today = new Date();
  const days: Array<{ date: string; label: string; reviewed: number; highRisk: number }> = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split("T")[0]!;
    const label = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
    days.push({
      date: iso,
      label,
      reviewed: dailyReviewed[iso] ?? 0,
      highRisk: dailyHighRisk[iso] ?? 0,
    });
  }

  const maxReviewed = Math.max(...days.map((d) => d.reviewed), 1);

  return days
    .map(
      (d) => `
      <div class="bar-col">
        <div class="bar-wrap" title="${d.reviewed} reviewed, ${d.highRisk} high risk">
          <div class="bar-reviewed" style="height: ${Math.round((d.reviewed / maxReviewed) * 48)}px"></div>
          ${d.highRisk > 0 ? `<div class="bar-high" style="height: ${Math.round((d.highRisk / maxReviewed) * 48)}px"></div>` : ""}
        </div>
        <div class="bar-label">${d.label}</div>
      </div>`,
    )
    .join("");
}

function buildSignalList(history: DecisionRecord[]): string {
  if (history.length === 0) return `<span class="sum-empty">No data yet</span>`;

  const counts = new Map<SignalName, number>();
  for (const record of history) {
    for (const sig of record.signals ?? []) {
      counts.set(sig, (counts.get(sig) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sorted.length === 0) return `<span class="sum-empty">No signal data yet</span>`;

  const max = sorted[0]![1];
  return sorted
    .map(
      ([sig, count]) => `
      <div class="sum-list-item">
        <span class="sum-list-name">${formatSignalName(sig)}</span>
        <div class="sum-list-bar-wrap">
          <div class="sum-list-bar" style="width: ${Math.round((count / max) * 100)}%"></div>
        </div>
        <span class="sum-list-count">${count}</span>
      </div>`,
    )
    .join("");
}

function buildCategoryList(history: DecisionRecord[]): string {
  if (history.length === 0) return `<span class="sum-empty">No data yet</span>`;

  const counts = new Map<Category, number>();
  for (const record of history) {
    if (record.category) {
      counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sorted.length === 0) return `<span class="sum-empty">No category data yet</span>`;

  const max = sorted[0]![1];
  return sorted
    .map(
      ([cat, count]) => `
      <div class="sum-list-item">
        <span class="sum-list-name">${cat}</span>
        <div class="sum-list-bar-wrap">
          <div class="sum-list-bar" style="width: ${Math.round((count / max) * 100)}%"></div>
        </div>
        <span class="sum-list-count">${count}</span>
      </div>`,
    )
    .join("");
}

function buildHistoryList(history: DecisionRecord[]): string {
  if (history.length === 0) return `<span class="sum-empty">No decisions recorded yet</span>`;

  return history
    .slice(0, 50)
    .map(
      (r) => `
      <div class="sum-history-item">
        <span class="sum-history-risk ${r.riskLevel}">${riskDot(r.riskLevel)}</span>
        <span class="sum-history-title">${escapeHtml(r.title.slice(0, 45))}${r.title.length > 45 ? "…" : ""}</span>
        <span class="sum-history-action">${r.action}</span>
        <span class="sum-history-time">${formatRelativeTime(r.timestamp)}</span>
      </div>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Trend computation
// ---------------------------------------------------------------------------

function computeTrend(dailyReviewed: Record<string, number>): { up: boolean; label: string } {
  const today = new Date();
  const todayIso = today.toISOString().split("T")[0]!;
  const todayCount = dailyReviewed[todayIso] ?? 0;

  // Average of prior 6 days
  let priorSum = 0;
  let priorDays = 0;
  for (let i = 1; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split("T")[0]!;
    const v = dailyReviewed[iso] ?? 0;
    if (v > 0) {
      priorSum += v;
      priorDays++;
    }
  }

  const priorAvg = priorDays > 0 ? priorSum / priorDays : 0;

  if (priorAvg === 0) {
    return { up: true, label: "Queue review speed improving this week" };
  }
  if (todayCount >= priorAvg) {
    return { up: true, label: "Queue review speed improved this week" };
  }
  return { up: false, label: "Review activity lower than recent average" };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatSignalName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskDot(risk: string): string {
  const dots: Record<string, string> = {
    high: "●",
    medium: "●",
    low: "●",
    needs_review: "●",
  };
  return dots[risk] ?? "●";
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
