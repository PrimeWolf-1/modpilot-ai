// ModPilot AI — Server Entry Point

import type { IncomingMessage, ServerResponse } from "node:http";
import { context, reddit } from "@devvit/web/server";
import type { TriggerResponse, UiResponse } from "@devvit/web/shared";
import { once } from "node:events";

import { ApiEndpoint } from "../shared/api.ts";
import type {
  GetQueueResponse,
  GetStatsResponse,
  TakeActionRequest,
  TakeActionResponse,
} from "../shared/types.ts";
import { fetchModQueue } from "./queueLoader.ts";
import {
  appendDecision,
  getStats,
  incrementActions,
  incrementEscalated,
  incrementHighRisk,
  incrementReviewed,
} from "./stats.ts";

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------

export async function serverOnRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  try {
    await onRequest(req, rsp);
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`;
    console.error(msg);
    writeJSON(500, { error: msg, status: 500 }, rsp);
  }
}

async function onRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  const url = req.url;

  if (!url || url === "/") {
    writeJSON(404, { error: "not found", status: 404 }, rsp);
    return;
  }

  const endpoint = url as ApiEndpoint;

  switch (endpoint) {
    case ApiEndpoint.Queue:
      writeJSON(200, await onGetQueue(), rsp);
      break;
    case ApiEndpoint.Action:
      writeJSON(200, await onTakeAction(req), rsp);
      break;
    case ApiEndpoint.Stats:
      writeJSON(200, await onGetStats(), rsp);
      break;
    case ApiEndpoint.OnPostCreate:
      writeJSON(200, await onMenuModOpen(), rsp);
      break;
    case ApiEndpoint.OnAppInstall:
      writeJSON(200, await onAppInstall(), rsp);
      break;
    default:
      writeJSON(404, { error: "not found", status: 404 }, rsp);
      break;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/queue
 * Fetches, scores, and returns the full mod queue for the current subreddit.
 */
async function onGetQueue(): Promise<GetQueueResponse> {
  const items = await fetchModQueue();
  return {
    type: "queue_data",
    items,
    username: context.username ?? "moderator",
    subreddit: context.subredditName ?? "",
  };
}

/**
 * POST /api/action
 * Executes a moderation action on a post and updates stats.
 */
async function onTakeAction(req: IncomingMessage): Promise<TakeActionResponse> {
  const body = await readJSON<TakeActionRequest>(req);
  const { postId, action, riskLevel, category, signals, modNote, removalReason, accepted_suggestion } = body;

  try {
    const post = await reddit.getPostById(`t3_${postId}`);

    switch (action) {
      case "approve":
        await post.approve();
        break;

      case "remove": {
        await post.remove(false);
        if (modNote || removalReason) {
          await reddit.addModNote({
            subreddit: post.subredditName,
            user: post.authorName,
            redditId: `t3_${postId}`,
            note: modNote ?? removalReason ?? "",
            label: "SPAM_WARNING",
          });
        }
        break;
      }

      case "warn":
        await reddit.sendPrivateMessage({
          to: post.authorName,
          subject: `Moderator notice — ${post.subredditName}`,
          text:
            modNote ??
            `Your post "${post.title}" has been flagged for review. Please review the community rules.`,
        });
        break;

      case "escalate":
        // Logged below; no Reddit API action required
        break;

      case "ignore":
        // No action — mod is handling manually
        break;
    }

    // Update stats (all in parallel for speed)
    // "warn" is not a final moderation decision — excluded from reviewed count
    const statsOps: Promise<void>[] = [incrementActions()];
    if (action !== "warn") statsOps.push(incrementReviewed());
    if (action === "escalate") statsOps.push(incrementEscalated());
    if (riskLevel === "high")  statsOps.push(incrementHighRisk());
    await Promise.all(statsOps);

    // Append full decision record to 50-item history
    await appendDecision({
      postId,
      title: post.title,
      author: post.authorName,
      riskLevel,
      category,
      signals,
      action,
      accepted_suggestion,
      timestamp: Date.now(),
    });

    return { type: "action_complete", postId, action, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`onTakeAction error for ${postId}:`, error);
    return { type: "action_complete", postId, action, success: false, error };
  }
}

/**
 * GET /api/stats
 * Returns current session stats from KV store.
 */
async function onGetStats(): Promise<GetStatsResponse> {
  const stats = await getStats();
  return { type: "stats_data", stats };
}

/**
 * POST /internal/menu/post-create  (menu action: "Open ModPilot AI")
 * Creates the ModPilot dashboard post and navigates to it.
 */
async function onMenuModOpen(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({
    title: "ModPilot AI — Mod Queue Triage",
    subredditName: context.subredditName ?? "",
  });
  return {
    showToast: { text: "ModPilot AI dashboard opened.", appearance: "success" },
    navigateTo: post.url,
  };
}

/**
 * POST /internal/on-app-install
 * Creates the initial ModPilot dashboard post on install.
 */
async function onAppInstall(): Promise<TriggerResponse> {
  try {
    await reddit.submitCustomPost({
      title: "ModPilot AI — Mod Queue Triage",
      subredditName: context.subredditName ?? "",
    });
  } catch (err) {
    console.error("onAppInstall: could not create post:", err);
  }
  return {};
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function writeJSON<T>(
  status: number,
  json: T,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json);
  const len = Buffer.byteLength(body);
  rsp.writeHead(status, {
    "Content-Length": len,
    "Content-Type": "application/json",
  });
  rsp.end(body);
}

async function readJSON<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  await once(req, "end");
  return JSON.parse(`${Buffer.concat(chunks)}`) as T;
}

