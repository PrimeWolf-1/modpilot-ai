// ModPilot AI — Queue Fetching and Normalization

import { reddit, context } from "@devvit/web/server";
import type { Post, User } from "@devvit/reddit";
import type { PreparedPost, TriageItem } from "../shared/types.ts";
import { scorePost } from "./scorer.ts";
import { analyzeWithGroq, shouldAnalyzeWithGroq } from "./groq.ts";

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
// Test mode — flip to true to bypass the Reddit API and use mock posts
// ---------------------------------------------------------------------------

const TEST_MODE = true;

const MOCK_POSTS: PreparedPost[] = [
  {
    id: "mock_001",
    title: "FREE CRYPTO GIVEAWAY CLICK NOW",
    body: "Win free bitcoin and crypto today! Guaranteed returns on every investment. Limited time offer — click here: https://crypto-giveaway.fake to claim your tokens.",
    author: "crypto_bot_99",
    authorAge: 2,
    subreddit: "PrimeWolfDev",
    url: "https://reddit.com/r/PrimeWolfDev/comments/mock001",
    permalink: "/r/PrimeWolfDev/comments/mock001",
    numLinks: 1,
    hasFlair: false,
    flairText: null,
    createdAt: Date.now() - 1000 * 60 * 5,
  },
  {
    id: "mock_002",
    title: "Mods are corrupt — join my Discord for real news",
    body: "The mods here are hiding the truth. Join my Discord server and check out my channel for unfiltered info: https://discord.gg/fake123. Don't let them silence us.",
    author: "discord_shiller",
    authorAge: 12,
    subreddit: "PrimeWolfDev",
    url: "https://reddit.com/r/PrimeWolfDev/comments/mock002",
    permalink: "/r/PrimeWolfDev/comments/mock002",
    numLinks: 1,
    hasFlair: false,
    flairText: null,
    createdAt: Date.now() - 1000 * 60 * 10,
  },
  {
    id: "mock_003",
    title: "Limited time investment opportunity — don't miss out",
    body: "Earn passive income and achieve financial freedom with this exclusive opportunity. Invest now before it expires. Use my referral link: https://invest.fake",
    author: "passive_income_guru",
    authorAge: 4,
    subreddit: "PrimeWolfDev",
    url: "https://reddit.com/r/PrimeWolfDev/comments/mock003",
    permalink: "/r/PrimeWolfDev/comments/mock003",
    numLinks: 1,
    hasFlair: false,
    flairText: null,
    createdAt: Date.now() - 1000 * 60 * 15,
  },
  {
    id: "mock_004",
    title: "Anyone know how to bypass the posting rules here?",
    body: "My posts keep getting removed for no reason. Check out my profile for context and use code SAVE20 at checkout. More info at https://mysite.fake",
    author: "confused_user",
    authorAge: 90,
    subreddit: "PrimeWolfDev",
    url: "https://reddit.com/r/PrimeWolfDev/comments/mock004",
    permalink: "/r/PrimeWolfDev/comments/mock004",
    numLinks: 1,
    hasFlair: true,
    flairText: "Question",
    createdAt: Date.now() - 1000 * 60 * 20,
  },
  {
    id: "mock_005",
    title: "Weekly discussion — what are you all working on?",
    body: "Hey everyone, just wanted to start a discussion about what projects you have going this week. I have been working on a new side project and would love to get some feedback from this community.",
    author: "regular_user",
    authorAge: 730,
    subreddit: "PrimeWolfDev",
    url: "https://reddit.com/r/PrimeWolfDev/comments/mock005",
    permalink: "/r/PrimeWolfDev/comments/mock005",
    numLinks: 0,
    hasFlair: true,
    flairText: "Discussion",
    createdAt: Date.now() - 1000 * 60 * 25,
  },
];

// ---------------------------------------------------------------------------
// Main queue fetcher
// ---------------------------------------------------------------------------

/**
 * Fetches the unmoderated queue for the current subreddit as a batch,
 * enriches each post with author age, scores it, optionally runs Groq
 * analysis, and returns TriageItems sorted by descending score.
 *
 * Batch strategy:
 *   1. Fetch all posts via getUnmoderated listing in one call
 *   2. Deduplicate authors → resolve ages in parallel
 *   3. Score all posts locally (synchronous)
 *   4. Run Groq only on medium/high risk items (parallel)
 */
export async function fetchModQueue(): Promise<TriageItem[]> {
  const subreddit = context.subredditName ?? "test";

  let preparedItems: { prepared: PreparedPost; scoringResult: ReturnType<typeof scorePost> }[];

  if (TEST_MODE) {
    // Skip Reddit API — score mock posts directly
    preparedItems = MOCK_POSTS.map((post) => ({
      prepared: { ...post, subreddit },
      scoringResult: scorePost(post),
    }));
  } else {
    if (!context.subredditName) {
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
    preparedItems = posts.map((post) => {
      const authorAge = authorAgeMap.get(post.authorName) ?? 365;
      const prepared = prepareTriageItem(post, authorAge);
      const scoringResult = scorePost(prepared);
      return { prepared, scoringResult };
    });
  }

  // 4. Run Groq only on medium/high risk items, in parallel
  const groqResults = await Promise.allSettled(
    preparedItems.map(({ prepared, scoringResult }) => {
      if (!shouldAnalyzeWithGroq(scoringResult.score)) {
        return Promise.resolve(null);
      }
      return analyzeWithGroq(prepared, scoringResult);
    }),
  );

  // 5. Assemble final TriageItems
  const items: TriageItem[] = preparedItems.map(({ prepared, scoringResult }, i) => {
    const groqResult =
      groqResults[i]?.status === "fulfilled"
        ? groqResults[i].value
        : null;

    const finalResult = groqResult
      ? {
          ...scoringResult,
          aiSummary: groqResult.summary,
          category: groqResult.category,
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
