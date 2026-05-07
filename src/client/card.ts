// ModPilot AI — Risk Cards (item 10)

import type { TriageItem } from "../shared/types.ts";

const RISK_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  needs_review: "Review",
};

const RISK_ICONS: Record<string, string> = {
  high: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  medium: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  low: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  needs_review: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

/**
 * Creates a risk card DOM element for a TriageItem.
 * @param item - The triage item to render
 * @param onCardClick - Callback invoked when the card is clicked
 */
export function createCard(
  item: TriageItem,
  onCardClick: (item: TriageItem) => void,
): HTMLElement {
  const { scoringResult } = item;
  const riskClass = `risk-${item.scoringResult.riskLevel}`;
  const accountAge = formatAge(item.authorAge);

  const card = document.createElement("div");
  card.className = `card ${riskClass}`;
  card.dataset["postId"] = item.id;

  // Risk badge label
  const badgeLabel = RISK_LABELS[scoringResult.riskLevel] ?? scoringResult.riskLevel;

  // Signal tags HTML (staggered animation)
  const signalTags = scoringResult.signals
    .slice(0, 4) // cap at 4 tags to avoid overflow
    .map(
      (s, i) =>
        `<span class="signal-tag" style="animation-delay: ${i * 50}ms">${escapeHtml(s.label)}</span>`,
    )
    .join("");

  // Intensity bar width (0–100 based on score clamped to 100)
  const intensity = Math.min(100, scoringResult.score);

  const riskIcon = RISK_ICONS[scoringResult.riskLevel] ?? "";

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">${escapeHtml(item.title)}</div>
      <div class="card-risk-hud ${scoringResult.riskLevel}">
        ${riskIcon}
        <span class="risk-badge ${scoringResult.riskLevel}">${badgeLabel}</span>
      </div>
    </div>
    <div class="card-meta">
      <span>u/${escapeHtml(item.author)}</span>
      <span class="card-meta-sep">·</span>
      <span>${accountAge}</span>
    </div>
    <div class="card-confidence ${scoringResult.riskLevel}">
      ${scoringResult.confidence}% confidence
    </div>
    <div class="card-signals">${signalTags}</div>
    ${scoringResult.aiSummary
      ? `<div class="card-ai-reason">${escapeHtml(scoringResult.aiSummary.slice(0, 80))}${scoringResult.aiSummary.length > 80 ? "…" : ""}</div>`
      : ""}
    <div class="card-intensity-bar">
      <div class="card-intensity-fill" style="width: ${intensity}%"></div>
    </div>
  `;

  card.addEventListener("click", () => onCardClick(item));

  return card;
}

/**
 * Marks a card as selected and activates the selection focus overlay.
 */
export function selectCard(postId: string, riskLevel?: string): void {
  document.querySelectorAll(".card.selected").forEach((el) => el.classList.remove("selected"));
  document.querySelectorAll<HTMLElement>(".column.col-focused").forEach((el) => el.classList.remove("col-focused"));

  const card = document.querySelector<HTMLElement>(`.card[data-post-id="${postId}"]`);
  if (!card) return;

  card.classList.add("selected");
  card.closest<HTMLElement>(".column")?.classList.add("col-focused");
  document.getElementById("queue-grid")?.classList.add("has-selection");

  const panel = document.getElementById("detail-panel");
  if (panel) {
    if (riskLevel) panel.dataset["riskFocus"] = riskLevel;
    else delete panel.dataset["riskFocus"];
  }
}

/**
 * Clears all card selection and focus overlay state.
 */
export function clearCardFocus(): void {
  document.querySelectorAll(".card.selected").forEach((el) => el.classList.remove("selected"));
  document.querySelectorAll(".card.pending-removal").forEach((el) => el.classList.remove("pending-removal"));
  document.querySelectorAll<HTMLElement>(".column.col-focused").forEach((el) => el.classList.remove("col-focused"));
  document.getElementById("queue-grid")?.classList.remove("has-selection");
  const panel = document.getElementById("detail-panel");
  if (panel) delete panel.dataset["riskFocus"];
}

/**
 * Removes a card from the DOM with an exit animation matching the action taken.
 * Phase 1: visual fade/pulse (approve 380ms, remove 220ms).
 * Phase 2: height collapse so surrounding cards shift up smoothly (180ms).
 */
export function removeCard(postId: string, action?: string): void {
  const card = document.querySelector<HTMLElement>(
    `.card[data-post-id="${postId}"]`,
  );
  if (!card) return;

  const cls = action === "approve" ? "card-exit-approve" : "card-exit-remove";
  const visualMs = action === "approve" ? 260 : 220;

  card.classList.add(cls);

  setTimeout(() => {
    const h = card.offsetHeight;
    card.style.height = `${h}px`;
    card.style.overflow = "hidden";
    card.style.transition = "height 0.18s ease, padding-top 0.18s ease, padding-bottom 0.18s ease";
    void card.offsetHeight; // force reflow before starting transition
    card.style.height = "0";
    card.style.paddingTop = "0";
    card.style.paddingBottom = "0";
    setTimeout(() => card.remove(), 190);
  }, visualMs);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAge(days: number): string {
  if (days < 1) return "< 1 day old";
  if (days < 7) return `${days}d old`;
  if (days < 30) return `${Math.floor(days / 7)}w old`;
  if (days < 365) return `${Math.floor(days / 30)}mo old`;
  return `${Math.floor(days / 365)}yr old`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
