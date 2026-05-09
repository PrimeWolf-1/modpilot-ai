// ModPilot AI — Splash / Launcher
// Always shown in embedded mode (mobile + desktop).
// Fullscreen dashboard opens only when the user clicks "Open Dashboard".

import { context, requestExpandedMode } from "@devvit/web/client";

const startButton = document.getElementById("start-button") as HTMLButtonElement;
const greeting = document.getElementById("greeting") as HTMLDivElement;

function init(): void {
  const username = context.username;
  if (username && greeting) {
    greeting.textContent = `Welcome, u/${username}`;
  }

  startButton?.addEventListener("click", (e) => {
    requestExpandedMode(e, "game");
  });
}

init();
