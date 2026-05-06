// ModPilot AI — Splash / Launcher

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

  // On desktop skip the splash and open the dashboard directly
  if (window.innerWidth >= 768) {
    startButton?.click();
  }
}

init();
