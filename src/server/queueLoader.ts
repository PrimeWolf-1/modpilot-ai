// ModPilot AI — Queue Fetching and Normalization

import { reddit, context } from "@devvit/web/server";
import type { PreparedPost, TriageItem } from "../shared/types.ts";
import { scorePost } from "./scorer.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the account age in days for a given username.
 * Uses the reddit API — note: called once per batch, not per-item.
 */
async function extractAuthorAge(username: string): Promise<number> {
  try {
    const user = await reddit.getUserByUsername(username);
    const createdAt = (user as unknown as { createdAt: number }).createdAt ?? Date.now();
    const ageMs = Date.now() - createdAt;
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  } catch {
    // Unknown account age — treat as established to avoid false positives
    return 365;
  }
}

/**
 * Counts external links (http/https) in a post body.
 */
export function countLinks(body: string): number {
  const matches = body.match(/https?:\/\/[^\s)>\]"]+/gi);
  return matches ? matches.length : 0;
}

/**
 * Detects flair status from a raw post object.
 */
export function detectFlair(post: RawPost): { hasFlair: boolean; flairText: string | null } {
  const flairText =
    (post.link_flair_text as string | null) ?? null;
  return {
    hasFlair: flairText !== null && flairText.trim().length > 0,
    flairText,
  };
}

// ---------------------------------------------------------------------------
// Types (raw Reddit mod queue post shape)
// ---------------------------------------------------------------------------

interface RawPost {
  id: string;
  title: string;
  selftext?: string;
  author: string;
  subreddit: string;
  url: string;
  permalink: string;
  link_flair_text?: string | null;
  created_utc: number;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw Reddit post + pre-fetched author age into a PreparedPost.
 * Never calls Reddit API — all enrichment happens upstream in fetchModQueue.
 */
export function prepareTriageItem(post: RawPost, authorAge: number): PreparedPost {
  const body = post.selftext ?? "";
  const { hasFlair, flairText } = detectFlair(post);

  return {
    id: post.id,
    title: post.title,
    body,
    author: post.author,
    authorAge,
    subreddit: post.subreddit,
    url: post.url,
    permalink: post.permalink,
    numLinks: countLinks(body),
    hasFlair,
    flairText,
    createdAt: Math.floor(post.created_utc * 1000),
  };
}

// ---------------------------------------------------------------------------
// Main queue fetcher
// ---------------------------------------------------------------------------

/**
 * Fetches the full mod queue for the current subreddit as a batch,
 * enriches each post with author age, scores it, and returns TriageItems.
 *
 * Batch strategy: fetch all posts first, then resolve author ages in parallel
 * to avoid serial per-item API calls.
 */
export async function fetchModQueue(): Promise<TriageItem[]> {
  const subreddit = context.subredditName;
  if (!subreddit) {
    throw new Error("No subreddit context available");
  }

  // 1. Batch-fetch the mod queue (all items at once)
  const rawPosts = await fetchRawQueue(subreddit);
  if (rawPosts.length === 0) return [];

  // 2. Deduplicate authors to minimize API calls
  const uniqueAuthors = [...new Set(rawPosts.map((p) => p.author))];
  const authorAgeMap = new Map<string, number>();

  // Batch-resolve author ages in parallel
  const ages = await Promise.all(uniqueAuthors.map((u) => extractAuthorAge(u)));
  uniqueAuthors.forEach((username, i) => {
    authorAgeMap.set(username, ages[i] ?? 365);
  });

  // 3. Prepare and score each post
  const items: TriageItem[] = rawPosts.map((raw) => {
    const authorAge = authorAgeMap.get(raw.author) ?? 365;
    const prepared = prepareTriageItem(raw, authorAge);
    const scoringResult = scorePost(prepared);

    return {
      ...prepared,
      scoringResult,
      status: "pending",
    };
  });

  return items;
}

// ---------------------------------------------------------------------------
// Raw queue fetch (uses Reddit listing API)
// ---------------------------------------------------------------------------

async function fetchRawQueue(subreddit: string): Promise<RawPost[]> {
  try {
    // Use the reddit API listing — fetch up to 100 items at once
    const listing = await (reddit as unknown as RedditWithMod).getModerationQueue({
      subreddit,
      type: "links",
      limit: 100,
    });
    return listing ?? [];
  } catch (err) {
    console.error("fetchModQueue error:", err);
    return [];
  }
}

// Minimal type shim for Devvit reddit API moderation methods
interface RedditWithMod {
  getModerationQueue(opts: {
    subreddit: string;
    type: string;
    limit: number;
  }): Promise<RawPost[]>;
}
