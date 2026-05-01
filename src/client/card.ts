// ModPilot AI — Risk Cards (item 10)

import type { TriageItem } from "../shared/types.ts";

const RISK_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  needs_review: "Review",
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

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">${escapeHtml(item.title)}</div>
      <span class="risk-badge ${scoringResult.riskLevel}">${badgeLabel}</span>
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
    <div class="card-intensity-bar">
      <div class="card-intensity-fill" style="width: ${intensity}%"></div>
    </div>
  `;

  card.addEventListener("click", () => onCardClick(item));

  return card;
}

/**
 * Marks a card as selected (highlighted) and deselects others.
 */
export function selectCard(postId: string): void {
  document.querySelectorAll(".card.selected").forEach((el) => {
    el.classList.remove("selected");
  });
  const card = document.querySelector<HTMLElement>(
    `.card[data-post-id="${postId}"]`,
  );
  card?.classList.add("selected");
}

/**
 * Removes a card from the DOM (after an action is taken).
 */
export function removeCard(postId: string): void {
  const card = document.querySelector<HTMLElement>(
    `.card[data-post-id="${postId}"]`,
  );
  if (!card) return;
  card.style.transition = "opacity 0.2s, transform 0.2s";
  card.style.opacity = "0";
  card.style.transform = "scale(0.95)";
  setTimeout(() => card.remove(), 220);
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
