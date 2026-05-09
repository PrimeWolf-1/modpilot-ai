// ModPilot AI — Detail Panel (item 11)

import type { TriageItem, TakeActionRequest, ScoringResult } from "../shared/types.ts";
import { ApiEndpoint } from "../shared/api.ts";
import { selectCard, removeCard, clearCardFocus } from "./card.ts";

type ActionCallback = (postId: string, action: string, accepted: boolean) => void;

export interface PanelHistoryEntry {
  action: string;
  timestamp: number;
}

const PANEL_RISK_ICONS: Record<string, string> = {
  high:         "assets/icons/high-risk.png",
  medium:       "assets/icons/medium.png",
  low:          "assets/icons/low-risk.png",
  needs_review: "assets/icons/needs-review.png",
};

let currentItem: TriageItem | null = null;
let onActionComplete: ActionCallback | null = null;
let pendingReverseAction: string | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens the detail panel for a given TriageItem.
 * @param item         - the item to display
 * @param callback     - called when an action completes (postId, action, acceptedSuggestion)
 * @param historyEntry - when opened from Recent Activity, shows the Action History section
 */
export function openPanel(item: TriageItem, callback: ActionCallback, historyEntry?: PanelHistoryEntry): void {
  const wasOpen = document.getElementById("detail-panel")?.classList.contains("open");
  console.log(`[MPD] openPanel() id=${item.id} riskLevel=${item.scoringResult.riskLevel} status=${item.status} fromHistory=${!!historyEntry} panelWasOpen=${wasOpen}`);
  currentItem = item;
  onActionComplete = callback;

  populatePanel(item);
  populateHistorySection(historyEntry);
  selectCard(item.id, item.scoringResult.riskLevel);

  const panel = document.getElementById("detail-panel");
  panel?.classList.add("open");
  document.getElementById("panel-backdrop")?.classList.add("visible");

  hideRemoveConfirm();
}

/** Closes the detail panel. */
export function closePanel(): void {
  console.log(`[MPD] closePanel() currentItem=${currentItem?.id ?? "none"}`, new Error("stack").stack?.split("\n").slice(1, 4).join(" | "));
  const panel = document.getElementById("detail-panel");
  panel?.classList.remove("open");
  document.getElementById("panel-backdrop")?.classList.remove("visible");

  clearCardFocus();

  currentItem = null;
  pendingReverseAction = null;
  document.getElementById("panel-history-section")?.classList.add("hidden");
  document.getElementById("history-reverse-row")?.classList.add("hidden");
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
    const inPanel = panel.contains(target);
    const isACard = isCard(target);
    const targetId = (target instanceof Element) ? (target.id || target.className || target.nodeName) : String(target);
    if (!inPanel && !isACard) {
      console.warn(`[MPD] OUTSIDE-CLICK HANDLER closing panel — target="${targetId}" inPanel=${inPanel} isCard=${isACard} currentItem=${currentItem?.id ?? "none"}`);
      closePanel();
      onOutsideClick();
    } else {
      console.log(`[MPD] outside-click suppressed — target="${targetId}" inPanel=${inPanel} isCard=${isACard}`);
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

  // Reverse last action
  document.getElementById("btn-reverse-action")?.addEventListener("click", () => {
    if (!pendingReverseAction) return;
    void sendAction(pendingReverseAction as TakeActionRequest["action"], false);
  });
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
// Action History section
// ---------------------------------------------------------------------------

const ACTION_DISPLAY_LABELS: Record<string, string> = {
  approve:  "Approved",
  remove:   "Removed",
  warn:     "Sent Warning",
  escalate: "Escalated to Review",
  ignore:   "Ignored",
};

const ACTION_CSS_CLASSES: Record<string, string> = {
  approve:  "history-approved",
  remove:   "history-removed",
  warn:     "history-warned",
  escalate: "history-escalated",
  ignore:   "history-ignored",
};

function getReverseAction(action: string): string | null {
  const map: Record<string, string> = {
    approve: "remove",
    remove:  "approve",
    ignore:  "approve",
  };
  return map[action] ?? null;
}

function populateHistorySection(entry?: PanelHistoryEntry): void {
  const section    = document.getElementById("panel-history-section");
  const reverseRow = document.getElementById("history-reverse-row");

  if (!section || !entry || !currentItem) {
    section?.classList.add("hidden");
    pendingReverseAction = null;
    return;
  }

  section.classList.remove("hidden");

  const sr = currentItem.scoringResult;

  // Action Taken
  const actionEl = document.getElementById("history-action");
  if (actionEl) {
    const label = ACTION_DISPLAY_LABELS[entry.action] ?? entry.action;
    const cls   = ACTION_CSS_CLASSES[entry.action]   ?? "";
    actionEl.textContent = label;
    actionEl.className   = `action-history-value ${cls}`;
  }

  // Time
  const timeEl = document.getElementById("history-time");
  if (timeEl) {
    timeEl.textContent = new Date(entry.timestamp).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }

  // Reason — category / risk label
  const RISK_LABELS: Record<string, string> = {
    high: "High Risk", medium: "Medium", low: "Low Risk", needs_review: "Needs Review",
  };
  const reasonEl = document.getElementById("history-reason");
  if (reasonEl) {
    const riskLabel = RISK_LABELS[sr.riskLevel] ?? sr.riskLevel;
    reasonEl.textContent = `${sr.category} / ${riskLabel}`;
  }

  // Mod Note
  const noteEl  = document.getElementById("history-note");
  const noteRow = document.getElementById("history-note-row");
  if (noteEl && noteRow) {
    if (sr.modNote) {
      noteEl.textContent = sr.modNote;
      noteRow.style.display = "";
    } else {
      noteRow.style.display = "none";
    }
  }

  // Reverse button — only for reversible actions
  const reverseTarget = getReverseAction(entry.action);
  if (reverseTarget && reverseRow) {
    const btn = document.getElementById("btn-reverse-action") as HTMLButtonElement | null;
    reverseRow.classList.remove("hidden");
    pendingReverseAction = reverseTarget;
    if (btn) btn.textContent = `↩ ${ACTION_DISPLAY_LABELS[reverseTarget] ?? reverseTarget}`;
  } else {
    reverseRow?.classList.add("hidden");
    pendingReverseAction = null;
  }
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
