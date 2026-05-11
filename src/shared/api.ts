// ModPilot AI — API endpoint registry

export const ApiEndpoint = {
  // ModPilot data endpoints
  Queue: "/api/queue",
  Action: "/api/action",
  Undo: "/api/undo",
  Stats: "/api/stats",

  // Devvit internal triggers
  OnPostCreate: "/internal/menu/post-create",
  OnAppInstall: "/internal/on-app-install",
} as const;

export type ApiEndpoint = (typeof ApiEndpoint)[keyof typeof ApiEndpoint];
