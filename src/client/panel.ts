// ModPilot AI — Detail Panel (item 11)

import type { TriageItem, TakeActionRequest, ScoringResult } from "../shared/types.ts";
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
let currentHistoryEntry: HistoryEntry | null = null;
let onHistoryUndoComplete: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens the detail panel for a given TriageItem.
 * @param item     - the item to display
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

// ---------------------------------------------------------------------------
// History / audit panel
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  postId: string;
  title: string;
  author: string;
  action: string;
  timestamp: number;
  riskLevel: string;
  authorAge?: number;
  confidence?: number;
  category?: string;
  signals?: Array<{ name: string; label: string; weight: number }>;
  modNote?: string;
  aiSummary?: string;
  suggestedAction?: string;
  suggestedReason?: string;
  undone?: boolean;
  undoneAt?: number;
}

/** Opens the detail panel in read-only history/audit mode. */
export function openHistoryPanel(entry: HistoryEntry, onUndone?: () => void): void {
  currentItem = null;
  onActionComplete = null;
  currentHistoryEntry = entry;
  onHistoryUndoComplete = onUndone ?? null;

  populateHistoryPanel(entry);

  const panel = document.getElementById("detail-panel");
  if (!panel) return;
  panel.dataset["mode"] = "history";
  if (entry.riskLevel) panel.dataset["riskFocus"] = entry.riskLevel;
  panel.classList.add("open");
  document.getElementById("panel-backdrop")?.classList.add("visible");
  hideRemoveConfirm();
}

function populateHistoryPanel(entry: HistoryEntry): void {
  const ACTION_LABELS: Record<string, string> = {
    approve:  "Approved",
    remove:   "Removed",
    warn:     "Warning Sent",
    escalate: "Escalated",
    ignore:   "Ignored",
  };

  setText("panel-title", entry.title);
  setText("panel-author", `u/${entry.author}`);
  setText("panel-age", entry.authorAge !== undefined ? formatAge(entry.authorAge) : "—");

  // Risk level
  const riskEl = document.getElementById("panel-risk");
  if (riskEl) {
    riskEl.className = `breakdown-value ${entry.riskLevel}`;
    riskEl.innerHTML = "";
    const iconSrc = PANEL_RISK_ICONS[entry.riskLevel];
    if (iconSrc) {
      const img = document.createElement("img");
      img.src = iconSrc;
      img.className = "panel-risk-icon";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.addEventListener("error", () => img.remove());
      riskEl.appendChild(img);
    }
    riskEl.appendChild(document.createTextNode(formatRiskLabel(entry.riskLevel)));
  }

  // Confidence
  const confEl = document.getElementById("panel-confidence");
  if (confEl) {
    confEl.textContent = entry.confidence !== undefined ? `${entry.confidence}%` : "—";
    confEl.className = `breakdown-value ${entry.riskLevel}`;
  }

  setText("panel-category", entry.category ?? "—");

  // History-only: action taken + reviewed at
  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;
  const actionEl = document.getElementById("panel-action-taken");
  if (actionEl) {
    actionEl.textContent = actionLabel;
    actionEl.className = `breakdown-value history-action-${entry.action}`;
  }
  const reviewedEl = document.getElementById("panel-reviewed-at");
  if (reviewedEl) {
    reviewedEl.textContent = new Date(entry.timestamp).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    });
    reviewedEl.className = "breakdown-value";
  }

  // Detected signals
  const signalsEl = document.getElementById("panel-signals");
  if (signalsEl) {
    if (!entry.signals || entry.signals.length === 0) {
      signalsEl.innerHTML = `<span style="color:var(--text-dim);font-size:11px">No signals detected</span>`;
    } else {
      signalsEl.innerHTML = entry.signals
        .map((s) => `<span class="panel-signal-tag">${escapeHtml(s.label)}</span>`)
        .join("");
    }
  }

  // Threat analysis
  const summaryEl = document.getElementById("panel-ai-summary");
  if (summaryEl) {
    summaryEl.textContent = entry.aiSummary ?? "Analysis not available for past actions.";
  }

  // Threat meter
  const conf = entry.confidence ?? 0;
  const meterEl  = document.getElementById("threat-meter");
  const meterFill = document.getElementById("threat-meter-fill");
  const meterPct  = document.getElementById("threat-meter-pct");
  if (meterEl)   meterEl.className = `threat-meter ${entry.riskLevel}`;
  if (meterPct)  meterPct.textContent = entry.confidence !== undefined ? `${conf}%` : "—";
  if (meterFill) {
    meterFill.style.width = "0%";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (meterFill) meterFill.style.width = `${conf}%`;
      });
    });
  }

  // AI recommendation
  setText("panel-suggest-action", entry.suggestedAction ?? "—");
  setText("panel-suggest-reason", entry.suggestedReason ?? "—");
  setText("panel-note-text", entry.modNote || "No mod note");

  populateUndoSection(entry);
}

/** Closes the detail panel. */
export function closePanel(): void {
  const panel = document.getElementById("detail-panel");
  panel?.classList.remove("open");
  document.getElementById("panel-backdrop")?.classList.remove("visible");

  if (panel) delete panel.dataset["mode"];

  clearCardFocus();

  currentItem = null;
  currentHistoryEntry = null;
  onHistoryUndoComplete = null;
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

  // Undo/reinstate button (history mode only)
  document.getElementById("btn-undo-action")?.addEventListener("click", () => void sendUndoAction());
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

  // Threat analysis
  const summaryEl = document.getElementById("panel-ai-summary");
  if (summaryEl) {
    summaryEl.textContent = sr.aiSummary ?? buildThreatSummary(sr);
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
    enableButtons();

    if (action === "escalate") {
      moveCardToReview(item.id);
    } else if (action !== "warn") {
      removeCard(item.id, action);
    }
    // "warn": panel closes, card stays in its column for follow-up action
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

  disableConfirmButtons();

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
      enableButtons();
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

  // Freeze height so the collapse can be measured
  const h = card.offsetHeight;
  card.style.height = `${h}px`;
  card.style.overflow = "hidden";
  card.style.pointerEvents = "none";

  // Fade + slight rightward slide + collapse simultaneously
  card.style.transition = "opacity 0.18s ease-out, transform 0.18s ease-out, height 0.22s ease-out, padding-top 0.22s ease-out, padding-bottom 0.22s ease-out";
  void card.offsetHeight; // force reflow
  card.style.opacity = "0";
  card.style.transform = "translateX(8px)";
  card.style.height = "0";
  card.style.paddingTop = "0";
  card.style.paddingBottom = "0";

  setTimeout(() => {
    card.removeAttribute("style");
    const riskClasses = Array.from(card.classList).filter((c) => c.startsWith("risk-"));
    riskClasses.forEach((c) => card.classList.remove(c));
    card.classList.add("risk-needs_review", "card-enter-review");
    target.appendChild(card);
    target.querySelector(".col-empty")?.remove();
    card.addEventListener("animationend", () => card.classList.remove("card-enter-review"), { once: true });
  }, 230);
}

// ---------------------------------------------------------------------------
// Remove confirmation sub-panel
// ---------------------------------------------------------------------------

function showRemoveConfirm(): void {
  enableButtons(); // ensure confirm buttons are enabled regardless of prior state
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
// Undo / reinstate
// ---------------------------------------------------------------------------

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

const UNDO_BTN_LABELS: Record<string, string> = {
  remove:  "Reinstate Post",
  approve: "Undo Approval",
};

function populateUndoSection(entry: HistoryEntry): void {
  const section  = document.getElementById("panel-undo-section");
  const btn      = document.getElementById("btn-undo-action") as HTMLButtonElement | null;
  const statusEl = document.getElementById("undo-status");
  if (!section || !btn || !statusEl) return;

  const btnLabel = UNDO_BTN_LABELS[entry.action];

  if (entry.undone) {
    section.style.display = "";
    btn.style.display = "none";
    const when = entry.undoneAt ? relativeTime(entry.undoneAt) : "";
    statusEl.textContent = `↩ Undone${when ? " · " + when : ""}`;
    statusEl.style.display = "";
  } else if (btnLabel && !entry.undone && Date.now() - entry.timestamp <= UNDO_WINDOW_MS) {
    section.style.display = "";
    btn.textContent = btnLabel;
    btn.disabled = false;
    btn.style.display = "";
    statusEl.style.display = "none";
  } else {
    // expired window or action type with no reversal (warn, escalate, ignore)
    section.style.display = "none";
  }
}

async function sendUndoAction(): Promise<void> {
  if (!currentHistoryEntry) return;
  const entry = currentHistoryEntry;

  const btn = document.getElementById("btn-undo-action") as HTMLButtonElement | null;
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch(ApiEndpoint.Undo, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: entry.postId, originalAction: entry.action }),
    });
    const data = await resp.json() as { success: boolean; error?: string };

    if (data.success) {
      entry.undone = true;
      entry.undoneAt = Date.now();
      populateUndoSection(entry);
      onHistoryUndoComplete?.();
    } else {
      if (btn) btn.disabled = false;
      console.error("sendUndoAction failed:", data.error);
    }
  } catch (err) {
    console.error("sendUndoAction error:", err);
    if (btn) btn.disabled = false;
  }
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ---------------------------------------------------------------------------
// Button state
// ---------------------------------------------------------------------------

const MAIN_ACTION_IDS = ["btn-approve", "btn-remove", "btn-warn", "btn-escalate", "btn-ignore"] as const;
const CONFIRM_IDS = ["btn-remove-confirm", "btn-remove-no-note", "btn-remove-cancel"] as const;

function disableButtons(): void {
  // Scoped to main action buttons only — never disables the confirm sub-panel buttons
  for (const id of MAIN_ACTION_IDS) {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (el) el.disabled = true;
  }
}

function enableButtons(): void {
  // Re-enables all buttons (full reset for panel open / action complete)
  document.querySelectorAll<HTMLButtonElement>(".action-btn").forEach((btn) => {
    btn.disabled = false;
  });
}

function disableConfirmButtons(): void {
  for (const id of CONFIRM_IDS) {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (el) el.disabled = true;
  }
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

function buildThreatSummary(sr: ScoringResult): string {
  const count = sr.signals.length;

  if (count === 0) {
    return `No risk signals detected. Pattern consistent with ${sr.category}. Confidence: ${sr.confidence}%.`;
  }

  const top = [...sr.signals]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((s) => s.label);

  const signalList =
    top.length === 1 ? top[0]! :
    top.length === 2 ? `${top[0]} and ${top[1]}` :
    `${top[0]}, ${top[1]}, and ${top[2]}`;

  return `Post exhibits ${count} risk signal${count !== 1 ? "s" : ""} including ${signalList}. Pattern consistent with ${sr.category}. Confidence: ${sr.confidence}%.`;
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
