// ModPilot AI — MOTD System
// Handles message rotation, manual selection, and picker UI.

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface MotdMessage {
  id: number;
  text: string;
  category:
    | "appreciation"
    | "calm-focus"
    | "community-trust"
    | "moderator-wellness"
    | "anti-burnout"
    | "human-judgment"
    | "safety"
    | "professionalism";
  tone: "affirming" | "grounding" | "energizing" | "reflective";
  priority?: number;
}

// ---------------------------------------------------------------------------
// Message library (expandable)
// ---------------------------------------------------------------------------

export const MOTD_MESSAGES: MotdMessage[] = [
  {
    id: 1,
    text: "Every removed spam post protected a real person today.",
    category: "safety",
    tone: "affirming",
    priority: 1,
  },
  {
    id: 2,
    text: "Queue pressure is temporary. Community trust is permanent.",
    category: "calm-focus",
    tone: "grounding",
    priority: 1,
  },
  {
    id: 3,
    text: "You are the last line of defense. The community counts on you.",
    category: "appreciation",
    tone: "affirming",
  },
  {
    id: 4,
    text: "Good moderation is invisible. Bad moderation is unforgettable.",
    category: "professionalism",
    tone: "reflective",
  },
  {
    id: 5,
    text: "Behind every removed post is a community made safer.",
    category: "safety",
    tone: "affirming",
  },
  {
    id: 6,
    text: "Moderators don't get enough credit. You get it here.",
    category: "appreciation",
    tone: "affirming",
    priority: 1,
  },
  {
    id: 7,
    text: "The work you do today shapes this community for years.",
    category: "community-trust",
    tone: "reflective",
  },
  {
    id: 8,
    text: "Spam never stops. Your consistency keeps communities stable.",
    category: "professionalism",
    tone: "grounding",
  },
  {
    id: 9,
    text: "You didn't volunteer for attention. You volunteered to protect the community.",
    category: "appreciation",
    tone: "reflective",
  },
  {
    id: 10,
    text: "Every decision you make reflects the community you're building.",
    category: "community-trust",
    tone: "reflective",
  },
  {
    id: 11,
    text: "Protecting people is never a small thing.",
    category: "safety",
    tone: "affirming",
  },
  {
    id: 12,
    text: "Real moderation takes judgment, not just rules.",
    category: "human-judgment",
    tone: "grounding",
  },
  {
    id: 13,
    text: "You are the human in the loop. That matters.",
    category: "human-judgment",
    tone: "affirming",
    priority: 1,
  },
  {
    id: 14,
    text: "One accurate removal beats ten wrong ones.",
    category: "human-judgment",
    tone: "grounding",
  },
  {
    id: 15,
    text: "Bad actors count on mods burning out. Don't give them that.",
    category: "anti-burnout",
    tone: "energizing",
  },
  {
    id: 16,
    text: "Moderation is an act of community care.",
    category: "moderator-wellness",
    tone: "affirming",
  },
  {
    id: 17,
    text: "You're not just enforcing rules. You're defending a culture.",
    category: "community-trust",
    tone: "reflective",
  },
  {
    id: 18,
    text: "Every warning sent is a chance to redirect, not just punish.",
    category: "human-judgment",
    tone: "grounding",
  },
  {
    id: 19,
    text: "Communities don't protect themselves. You do.",
    category: "safety",
    tone: "affirming",
  },
  {
    id: 20,
    text: "Consistency builds trust. You're building it right now.",
    category: "community-trust",
    tone: "energizing",
  },
  {
    id: 21,
    text: "High risk flagged. Time saved. Mission ongoing.",
    category: "calm-focus",
    tone: "energizing",
  },
  {
    id: 22,
    text: "The queue never stops. Neither does your impact.",
    category: "anti-burnout",
    tone: "energizing",
  },
  {
    id: 23,
    text: "You moderate so others can participate safely.",
    category: "moderator-wellness",
    tone: "affirming",
  },
  {
    id: 24,
    text: "This subreddit exists because someone decided to protect it. That someone is you.",
    category: "appreciation",
    tone: "reflective",
    priority: 1,
  },
];

// ---------------------------------------------------------------------------
// Persistence (localStorage, fail-safe)
// ---------------------------------------------------------------------------

const STORE_MODE      = "modpilot-motd-mode";       // "auto" | "manual"
const STORE_INDEX     = "modpilot-motd-index";       // sequential rotation index
const STORE_MANUAL_ID = "modpilot-motd-manual-id";  // manually selected message id
const STORE_LAST_ROT  = "modpilot-motd-last-rot";   // timestamp of last auto-advance

const ROTATION_MS = 12 * 60 * 60 * 1000; // 12 hours

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* unavailable */ }
}
function lsDel(key: string): void {
  try { localStorage.removeItem(key); } catch { /* unavailable */ }
}

// ---------------------------------------------------------------------------
// Core rotation logic
// ---------------------------------------------------------------------------

function isManual(): boolean {
  return lsGet(STORE_MODE) === "manual";
}

function getAutoMessage(): MotdMessage {
  const lastRot = parseInt(lsGet(STORE_LAST_ROT) ?? "0", 10);
  const now     = Date.now();
  let   index   = parseInt(lsGet(STORE_INDEX) ?? "0", 10);

  if (lastRot === 0) {
    // First ever load — seed the timer
    lsSet(STORE_LAST_ROT, String(now));
    lsSet(STORE_INDEX, "0");
    index = 0;
  } else if (now - lastRot >= ROTATION_MS) {
    // 12 hours elapsed — advance
    index = (index + 1) % MOTD_MESSAGES.length;
    lsSet(STORE_INDEX, String(index));
    lsSet(STORE_LAST_ROT, String(now));
  }

  return MOTD_MESSAGES[index] ?? MOTD_MESSAGES[0]!;
}

export function getCurrentMessage(): MotdMessage {
  if (isManual()) {
    const id = parseInt(lsGet(STORE_MANUAL_ID) ?? "1", 10);
    return MOTD_MESSAGES.find((m) => m.id === id) ?? MOTD_MESSAGES[0]!;
  }
  return getAutoMessage();
}

export function selectMessage(id: number): void {
  lsSet(STORE_MODE, "manual");
  lsSet(STORE_MANUAL_ID, String(id));
}

export function resetToAuto(): void {
  lsSet(STORE_MODE, "auto");
  lsDel(STORE_MANUAL_ID);
  lsSet(STORE_LAST_ROT, String(Date.now())); // restart 12-hour timer
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function updateDisplay(): void {
  const msg      = getCurrentMessage();
  const textEl   = document.getElementById("motive-text");
  const badgeEl  = document.getElementById("motd-manual-badge");
  const autoBtn  = document.getElementById("motd-auto-btn");

  if (textEl) {
    textEl.style.opacity = "0";
    setTimeout(() => {
      if (textEl) {
        textEl.textContent  = msg.text;
        textEl.style.opacity = "1";
      }
    }, 200);
  }

  if (badgeEl) {
    badgeEl.classList.toggle("hidden", !isManual());
  }
  if (autoBtn) {
    autoBtn.classList.toggle("hidden", !isManual());
  }
}


function renderPickerList(listEl: HTMLElement): void {
  const currentId  = getCurrentMessage().id;
  const autoActive = !isManual();

  const CATEGORY_LABELS: Record<string, string> = {
    "appreciation":       "Appreciation",
    "calm-focus":         "Calm Focus",
    "community-trust":    "Community Trust",
    "moderator-wellness": "Moderator Wellness",
    "anti-burnout":       "Anti-Burnout",
    "human-judgment":     "Human Judgment",
    "safety":             "Safety",
    "professionalism":    "Professionalism",
  };

  const autoRow = `<div class="motd-auto-item${autoActive ? " active" : ""}" id="motd-auto-row" role="option" aria-selected="${autoActive}" tabindex="0">
    <span class="motd-auto-item-icon">↺</span>
    <span class="motd-auto-item-label">Auto rotation</span>
    <span class="motd-auto-item-hint">Every 12 hours</span>
  </div>`;

  const messageRows = MOTD_MESSAGES.map((msg) => {
    const active   = msg.id === currentId && !autoActive ? " active" : "";
    const catLabel = CATEGORY_LABELS[msg.category] ?? msg.category;
    return `<div class="motd-picker-item${active}" data-id="${msg.id}" role="option" aria-selected="${msg.id === currentId && !autoActive}" tabindex="0">
      <span class="motd-item-text">${escapeHtml(msg.text)}</span>
      <span class="motd-item-meta">${escapeHtml(catLabel)} · ${escapeHtml(msg.tone)}</span>
    </div>`;
  }).join("");

  listEl.innerHTML = autoRow + messageRows;

  // Auto rotation item
  listEl.querySelector<HTMLElement>("#motd-auto-row")?.addEventListener("click", () => {
    resetToAuto();
    updateDisplay();
    renderPickerList(listEl);
    closePicker();
  });

  // Message items
  listEl.querySelectorAll<HTMLElement>(".motd-picker-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = parseInt(el.dataset["id"] ?? "1", 10);
      selectMessage(id);
      updateDisplay();
      renderPickerList(listEl);
      closePicker();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
    });
  });

  // Scroll active item into view
  setTimeout(() => {
    const active = listEl.querySelector<HTMLElement>(".motd-picker-item.active, .motd-auto-item.active");
    active?.scrollIntoView({ block: "nearest" });
  }, 0);
}

function closePicker(): void {
  const picker    = document.getElementById("motd-picker");
  const pickerBtn = document.getElementById("motd-picker-btn");
  picker?.classList.remove("visible");
  picker?.setAttribute("aria-hidden", "true");
  pickerBtn?.classList.remove("active");
  pickerBtn?.setAttribute("aria-expanded", "false");
}

export function initMotd(): void {
  updateDisplay();

  const pickerBtn = document.getElementById("motd-picker-btn");
  const picker    = document.getElementById("motd-picker");
  const autoBtn   = document.getElementById("motd-auto-btn");
  const listEl    = document.getElementById("motd-picker-list");

  if (listEl) renderPickerList(listEl);

  // Toggle picker open/close
  pickerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !picker?.classList.contains("visible");
    picker?.classList.toggle("visible", opening);
    picker?.setAttribute("aria-hidden", String(!opening));
    pickerBtn.classList.toggle("active", opening);
    pickerBtn.setAttribute("aria-expanded", String(opening));
    if (opening && listEl) renderPickerList(listEl);
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!picker?.classList.contains("visible")) return;
    if (picker.contains(e.target as Node) || pickerBtn?.contains(e.target as Node)) return;
    closePicker();
  });

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker?.classList.contains("visible")) closePicker();
  });

  // Nav-bar auto button (Manual badge area)
  autoBtn?.addEventListener("click", () => {
    resetToAuto();
    updateDisplay();
    if (listEl) renderPickerList(listEl);
    closePicker();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

