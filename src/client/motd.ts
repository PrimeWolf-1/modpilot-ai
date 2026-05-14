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

export function advanceMessage(): void {
  const current = parseInt(lsGet(STORE_INDEX) ?? "0", 10);
  const next = (current + 1) % MOTD_MESSAGES.length;
  lsSet(STORE_MODE, "auto");
  lsDel(STORE_MANUAL_ID);
  lsSet(STORE_INDEX, String(next));
  lsSet(STORE_LAST_ROT, String(Date.now()));
  updateDisplay();
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


export function initMotd(): void {
  updateDisplay();

  const pickerBtn = document.getElementById("motd-picker-btn");
  const autoBtn   = document.getElementById("motd-auto-btn");

  // Change button — rotate to next message directly
  pickerBtn?.addEventListener("click", () => {
    advanceMessage();
  });

  // Nav-bar auto button (Manual badge area)
  autoBtn?.addEventListener("click", () => {
    resetToAuto();
    updateDisplay();
  });

  // Check every minute whether the 12-hour window has elapsed
  setInterval(() => {
    if (!isManual()) {
      const lastRot = parseInt(lsGet(STORE_LAST_ROT) ?? "0", 10);
      if (lastRot > 0 && Date.now() - lastRot >= ROTATION_MS) {
        updateDisplay();
      }
    }
  }, 60_000);
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

