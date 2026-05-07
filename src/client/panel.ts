// ModPilot AI — Detail Panel (item 11)

import type { TriageItem, TakeActionRequest } from "../shared/types.ts";
import { ApiEndpoint } from "../shared/api.ts";
import { selectCard, removeCard, clearCardFocus } from "./card.ts";

type ActionCallback = (postId: string, action: string, accepted: boolean) => void;

const PANEL_RISK_ICONS: Record<string, string> = {
  high:         "assets/icons/high-risk.png",
  medium:       "assets/icons/medium.png",
  low:          "assets/icons/low-risk.png",
  needs_review: "assets/icons/needs-review.png",
};

let currentItem: TriageItem | null = null;
let onActionComplete: ActionCallback | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens the detail panel for a given TriageItem.
 * @param item - the item to display
 * @param callback - called when an action completes (postId, action, acceptedSuggestion)
 */
export function openPanel(item: TriageItem, callback: ActionCallback): void {
  currentItem = item;
  onActionComplete = callback;

  populatePanel(item);
  selectCard(item.id, item.scoringResult.riskLevel);

  const panel = document.getElementById("detail-panel");
  panel?.classList.add("open");
  document.getElementById("panel-backdrop")?.classList.add("visible");

  hideRemoveConfirm();
}

/** Closes the detail panel. */
export function closePanel(): void {
  const panel = document.getElementById("detail-panel");
  panel?.classList.remove("open");
  document.getElementById("panel-backdrop")?.classList.remove("visible");

  clearCardFocus();

  currentItem = null;
  hideRemoveConfirm();
}

/** Wires up panel close button and outside-click behavior. */
export function initPanel(onOutsideClick: () => void): void {
  document.getElementById("panel-close")?.addEventListener("click", () => {
    closePanel();
    onOutsideClick();
  });

  document.getElementById("panel-backdrop")?.addEventListener("click", () => {
    closePanel();
    onOutsideClick();
  });

  // Close on click outside the panel
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("detail-panel");
    if (!panel?.classList.contains("open")) return;
    const target = e.target as Node;
    if (!panel.contains(target) && !isCard(target)) {
      closePanel();
      onOutsideClick();
    }
  });

  // Wire action buttons
  document.getElementById("btn-approve")?.addEventListener("click", () => sendAction("approve", true));
  document.getElementById("btn-remove")?.addEventListener("click", showRemoveConfirm);
  document.getElementById("btn-warn")?.addEventListener("click", () => sendAction("warn", true));
  document.getElementById("btn-escalate")?.addEventListener("click", () => sendAction("escalate", false));
  document.getElementById("btn-ignore")?.addEventListener("click", () => sendAction("ignore", false));

  // Remove confirmation sub-panel
  document.getElementById("btn-remove-confirm")?.addEventListener("click", confirmRemoveWithNote);
  document.getElementById("btn-remove-no-note")?.addEventListener("click", () => sendAction("remove", true));
  document.getElementById("btn-remove-cancel")?.addEventListener("click", hideRemoveConfirm);

  // Copy mod note on click
  document.getElementById("panel-suggest-note")?.addEventListener("click", copyModNote);
}

// ---------------------------------------------------------------------------
// Populate panel
// ---------------------------------------------------------------------------

function populatePanel(item: TriageItem): void {
  const sr = item.scoringResult;

  setText("panel-title", item.title);
  setText("panel-author", `u/${item.author}`);
  setText("panel-age", formatAge(item.authorAge));

  const riskEl = document.getElementById("panel-risk");
  if (riskEl) {
    riskEl.className = `breakdown-value ${sr.riskLevel}`;
  }

  const confEl = document.getElementById("panel-confidence");
  if (confEl) {
    confEl.textContent = `${sr.confidence}%`;
    confEl.className = `breakdown-value ${sr.riskLevel}`;
  }

  setText("panel-category", sr.category);

  // Detected signals
  const signalsEl = document.getElementById("panel-signals");
  if (signalsEl) {
    if (sr.signals.length === 0) {
      signalsEl.innerHTML = `<span style="color:var(--text-dim);font-size:11px">No signals detected</span>`;
    } else {
      signalsEl.innerHTML = sr.signals
        .map((s) => `<span class="panel-signal-tag">${escapeHtml(s.label)}</span>`)
        .join("");
    }
  }

  // Threat analysis (formerly AI summary)
  const summaryEl = document.getElementById("panel-ai-summary");
  if (summaryEl) {
    if (sr.aiSummary) {
      summaryEl.textContent = sr.aiSummary;
    } else if (sr.riskLevel === "high" || sr.riskLevel === "medium") {
      summaryEl.innerHTML = `<span class="panel-ai-loading">Analyzing threat vectors…</span>`;
    } else {
      summaryEl.innerHTML = `<span class="panel-ai-loading">No threat vectors detected.</span>`;
    }
  }

  // Threat meter
  const meterEl = document.getElementById("threat-meter");
  const meterFill = document.getElementById("threat-meter-fill");
  const meterPct = document.getElementById("threat-meter-pct");

  if (meterEl) meterEl.className = `threat-meter ${sr.riskLevel}`;
  if (meterPct) meterPct.textContent = `${sr.confidence}%`;
  if (meterFill) {
    meterFill.style.width = "0%";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (meterFill) meterFill.style.width = `${sr.confidence}%`;
      });
    });
  }

  // Risk icon beside the risk level label
  if (riskEl) {
    riskEl.innerHTML = "";
    const iconSrc = PANEL_RISK_ICONS[sr.riskLevel];
    if (iconSrc) {
      const img = document.createElement("img");
      img.src = iconSrc;
      img.className = "panel-risk-icon";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.addEventListener("error", () => img.remove());
      riskEl.appendChild(img);
    }
    riskEl.appendChild(document.createTextNode(formatRiskLabel(sr.riskLevel)));
  }

  // Suggested action
  setText("panel-suggest-action", sr.suggestedAction);
  setText("panel-suggest-reason", sr.suggestedReason);
  setText("panel-note-text", sr.modNote || "No mod note suggested");

  // Pre-fill remove note textarea
  const removeNote = document.getElementById("remove-note") as HTMLTextAreaElement | null;
  if (removeNote) removeNote.value = sr.modNote ?? "";

  enableButtons();
}

// ---------------------------------------------------------------------------
// Action sending
// ---------------------------------------------------------------------------

async function sendAction(
  action: TakeActionRequest["action"],
  accepted_suggestion: boolean,
): Promise<void> {
  if (!currentItem) return;
  const item = currentItem;

  disableButtons();

  try {
    const payload: TakeActionRequest = {
      postId: item.id,
      action,
      riskLevel: item.scoringResult.riskLevel,
      category: item.scoringResult.category,
      signals: item.scoringResult.signals.map((s) => s.name),
      accepted_suggestion,
      modNote: item.scoringResult.modNote,
    };

    const resp = await fetch(ApiEndpoint.Action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json() as { success: boolean; error?: string };
    if (!data.success) {
      console.error("Action failed:", data.error);
    }

    closePanel();

    if (action === "escalate") {
      moveCardToReview(item.id);
    } else {
      removeCard(item.id, action);
    }
    onActionComplete?.(item.id, action, accepted_suggestion);
  } catch (err) {
    console.error("sendAction error:", err);
    enableButtons();
  }
}

async function confirmRemoveWithNote(): Promise<void> {
  if (!currentItem) return;
  const item = currentItem;
  const note = (document.getElementById("remove-note") as HTMLTextAreaElement | null)?.value ?? "";

  disableButtons();

  try {
    const payload: TakeActionRequest = {
      postId: item.id,
      action: "remove",
      riskLevel: item.scoringResult.riskLevel,
      category: item.scoringResult.category,
      signals: item.scoringResult.signals.map((s) => s.name),
      accepted_suggestion: true,
      modNote: note || item.scoringResult.modNote,
      removalReason: note,
    };

    const resp = await fetch(ApiEndpoint.Action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json() as { success: boolean };
    if (data.success) {
      closePanel();
      removeCard(item.id, "remove");
      onActionComplete?.(item.id, "remove", true);
    } else {
      enableButtons();
    }
  } catch (err) {
    console.error("confirmRemoveWithNote error:", err);
    enableButtons();
  }
}

// ---------------------------------------------------------------------------
// Move card to Needs Review column (escalate action)
// ---------------------------------------------------------------------------

function moveCardToReview(postId: string): void {
  const card = document.querySelector<HTMLElement>(`.card[data-post-id="${postId}"]`);
  const target = document.getElementById("cards-review");
  if (!card || !target) return;

  // Swap risk class to needs_review
  card.classList.forEach((cls) => {
    if (cls.startsWith("risk-")) card.classList.remove(cls);
  });
  card.classList.add("risk-needs_review");

  target.appendChild(card);
}

// ---------------------------------------------------------------------------
// Remove confirmation sub-panel
// ---------------------------------------------------------------------------

function showRemoveConfirm(): void {
  document.getElementById("remove-confirm")?.classList.add("visible");
  if (currentItem) {
    document.querySelector(`.card[data-post-id="${currentItem.id}"]`)
      ?.classList.add("pending-removal");
  }
}

function hideRemoveConfirm(): void {
  document.getElementById("remove-confirm")?.classList.remove("visible");
  document.querySelectorAll(".card.pending-removal").forEach((el) =>
    el.classList.remove("pending-removal"),
  );
}

// ---------------------------------------------------------------------------
// Copy mod note
// ---------------------------------------------------------------------------

function copyModNote(): void {
  if (!currentItem) return;
  const text = currentItem.scoringResult.modNote;
  if (!text) return;

  navigator.clipboard?.writeText(text).catch(() => {});

  const noteEl = document.getElementById("panel-note-text");
  if (noteEl) {
    const prev = noteEl.textContent;
    noteEl.textContent = "Copied!";
    setTimeout(() => { noteEl.textContent = prev; }, 1200);
  }
}

// ---------------------------------------------------------------------------
// Button state
// ---------------------------------------------------------------------------

function disableButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".action-btn").forEach((btn) => {
    btn.disabled = true;
  });
}

function enableButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".action-btn").forEach((btn) => {
    btn.disabled = false;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatAge(days: number): string {
  if (days < 1) return "< 1 day";
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
}

function formatRiskLabel(risk: string): string {
  const map: Record<string, string> = {
    high: "High Risk",
    medium: "Medium",
    low: "Low Risk",
    needs_review: "Needs Review",
  };
  return map[risk] ?? risk;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isCard(node: Node): boolean {
  let el: Element | null = node instanceof Element ? node : node.parentElement;
  while (el) {
    if (el.classList.contains("card")) return true;
    el = el.parentElement;
  }
  return false;
}
