// ModPilot AI — Embedded launch card.
// Shown in inline (embedded) mode on both mobile and desktop.
// The full 4-column dashboard only loads after requestExpandedMode succeeds.

import { context, requestExpandedMode } from "@devvit/web/client";

function init(): void {
  const subredditEl = document.getElementById("launch-subreddit");
  if (subredditEl && context.subredditName) {
    subredditEl.textContent = `r/${context.subredditName}`;
  }

  const openBtn = document.getElementById("open-btn");
  openBtn?.addEventListener("click", (e) => {
    requestExpandedMode(e as MouseEvent, "game");
  });
}

init();
