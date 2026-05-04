// ModPilot AI — Queue Fetching and Normalization

import { reddit, context } from "@devvit/web/server";
import type { Post, User } from "@devvit/reddit";
import type { PreparedPost, TriageItem } from "../shared/types.ts";
import { scorePost } from "./scorer.ts";
import { analyzeWithClaude, shouldAnalyzeWithClaude } from "./claude.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the account age in days for a given User object.
 */
export function extractAuthorAge(user: User): number {
  const ageMs = Date.now() - user.createdAt.getTime();
  return Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
}

/**
 * Counts external links (http/https URLs) in a text body.
 */
export function countLinks(body: string): number {
  const matches = body.match(/https?:\/\/[^\s)>\]"]+/gi);
  return matches ? matches.length : 0;
}

/**
 * Detects flair status from a Post object.
 */
export function detectFlair(post: Post): { hasFlair: boolean; flairText: string | null } {
  const flairText = post.flair?.text ?? null;
  return {
    hasFlair: flairText !== null && flairText.trim().length > 0,
    flairText,
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a Devvit Post + pre-resolved author age into a PreparedPost.
 * Never calls the Reddit API — all enrichment happens upstream.
 */
export function prepareTriageItem(post: Post, authorAge: number): PreparedPost {
  const body = post.body ?? "";
  const { hasFlair, flairText } = detectFlair(post);

  return {
    id: post.id,
    title: post.title,
    body,
    author: post.authorName,
    authorAge,
    subreddit: post.subredditName,
    url: post.url,
    permalink: post.permalink,
    numLinks: countLinks(body),
    hasFlair,
    flairText,
    createdAt: post.createdAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Main queue fetcher
// ---------------------------------------------------------------------------

/**
 * Fetches the unmoderated queue for the current subreddit as a batch,
 * enriches each post with author age, scores it, optionally runs Claude
 * analysis, and returns TriageItems sorted by descending score.
 *
 * Batch strategy:
 *   1. Fetch all posts via getUnmoderated listing in one call
 *   2. Deduplicate authors → resolve ages in parallel
 *   3. Score all posts locally (synchronous)
 *   4. Run Claude only on medium/high risk items (parallel)
 */
export async function fetchModQueue(): Promise<TriageItem[]> {
  const subreddit = context.subredditName;
  if (!subreddit) {
    throw new Error("No subreddit context available");
  }

  // 1. Batch-fetch unmoderated posts (new posts awaiting initial review, up to 100)
  const listing = reddit.getUnmoderated({ subreddit, type: "post", limit: 100 });
  const posts = await listing.all();

  if (posts.length === 0) return [];

  // 2. Deduplicate authors and batch-resolve ages in parallel
  const uniqueAuthors = [...new Set(posts.map((p) => p.authorName))];
  const authorAgeMap = new Map<string, number>();

  const userResults = await Promise.allSettled(
    uniqueAuthors.map((u) => reddit.getUserByUsername(u)),
  );

  uniqueAuthors.forEach((username, i) => {
    const result = userResults[i];
    if (result?.status === "fulfilled" && result.value) {
      authorAgeMap.set(username, extractAuthorAge(result.value));
    } else {
      // Unknown / deleted account — treat as established to avoid false positives
      authorAgeMap.set(username, 365);
    }
  });

  // 3. Prepare and score all posts synchronously
  const preparedItems = posts.map((post) => {
    const authorAge = authorAgeMap.get(post.authorName) ?? 365;
    const prepared = prepareTriageItem(post, authorAge);
    const scoringResult = scorePost(prepared);
    return { prepared, scoringResult };
  });

  // 4. Run Claude only on medium/high risk items, in parallel
  const claudeResults = await Promise.allSettled(
    preparedItems.map(({ prepared, scoringResult }) => {
      if (!shouldAnalyzeWithClaude(scoringResult.score)) {
        return Promise.resolve(null);
      }
      return analyzeWithClaude(prepared, scoringResult);
    }),
  );

  // 5. Assemble final TriageItems
  const items: TriageItem[] = preparedItems.map(({ prepared, scoringResult }, i) => {
    const claudeResult =
      claudeResults[i]?.status === "fulfilled"
        ? claudeResults[i].value
        : null;

    const finalResult = claudeResult
      ? {
          ...scoringResult,
          aiSummary: claudeResult.summary,
          category: claudeResult.category,
        }
      : scoringResult;

    return {
      ...prepared,
      scoringResult: finalResult,
      status: "pending" as const,
    };
  });

  // Sort descending by score so highest risk appears first
  items.sort((a, b) => b.scoringResult.score - a.scoringResult.score);

  return items;
}
