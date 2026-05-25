# ModPilot AI

**ModPilot AI** is a Reddit mod queue triage assistant built for the Reddit Mod Tools and Migrated Apps Hackathon using Devvit.

It helps moderators review queue items faster by scanning posts for risk signals, assigning a clear risk level, and showing the reason behind each flag. The goal is not to replace human moderators, but to make repetitive moderation review faster, clearer, and easier to manage.

## Project Overview

ModPilot AI gives moderators a dashboard-style workflow for reviewing queued Reddit posts. Each item is evaluated using practical moderation signals such as account age, external links, urgency language, money claims, promotional wording, missing flair, and repeated phrases.

The tool produces a risk score and explanation so moderators can quickly decide whether an item should be approved, removed, warned, or reviewed manually.

## Key Features

- Reddit moderation assistant built with Devvit
- Live mod queue triage dashboard
- Rule-based risk scoring system
- Low, Medium, and High risk labels
- Gemini AI explanation layer for medium and high risk posts
- Clear plain-language explanations for why a post was flagged
- Signal detection for spam, promo language, money claims, urgency phrases, external links, missing flair, new accounts, and repeated phrases
- Human-review workflow so moderators stay in control
- Queue impact metrics such as reviewed items, high-risk flags, and estimated time saved
- 24-hour reversible action window with audit log
- Graceful fallback to rule-based summaries when Gemini is unavailable

## Risk Scoring Logic

ModPilot AI uses practical moderation signals to help surface posts that may need closer review.

Example scoring signals:

| Signal | Purpose |
| --- | --- |
| Account under 24 hours | Flags very new accounts |
| Account under 7 days | Adds risk for recently created accounts |
| External link | Detects posts sending users off-platform |
| Urgency phrase | Finds pressure-based wording |
| Money claim | Detects financial promises or claims |
| Promo language | Flags possible advertising or spam |
| Missing flair | Helps enforce subreddit organization rules |
| Too many links | Detects link-heavy spam patterns |
| Repeated phrases | Flags copy/paste or bot-like behavior |

Risk levels:

| Score | Label |
| --- | --- |
| 0-20 | Low Risk |
| 21-50 | Medium Risk |
| 51+ | High Risk |

The project also includes an override rule where a money claim combined with an external link is treated as high risk.

## AI Explanation Layer

ModPilot AI includes a Gemini-powered explanation pipeline that runs for medium and high risk posts. When a post crosses the medium risk threshold, the queue loader calls Gemini to generate a plain-language explanation of why the post was flagged, based on the detected signals.

The integration is fully implemented. If the Gemini API call fails or times out, ModPilot automatically falls back to a rule-based text summary generated from the same signal data. The API key is stored through Devvit secret settings and is never committed to the repository.

## Security and Testing Status

ModPilot AI is now configured for controlled moderator testing.

Current safeguards:

- Live queue mode enabled
- All queue, stats, action, and undo endpoints require server-side moderator authentication
- Non-moderators receive 403 responses
- Gemini API key is stored through Devvit secret settings
- No API keys or secrets are committed to the repository
- Gemini failures fall back to rule-based summaries automatically

## Tech Stack

- Devvit
- TypeScript
- Reddit Developer Platform
- Rule-based moderation logic
- Google Gemini API (AI explanation layer)
- Devvit secret settings for secure key storage
- Devvit key-value storage for session stats and audit log

## Why It Matters

Moderators often need to review many posts quickly while still making fair decisions. ModPilot AI was designed to reduce repetitive review work, surface risky posts faster, and give moderators a cleaner explanation of why an item needs attention.

The system keeps the moderator in control. It is a triage assistant, not an auto-moderation replacement.

## Current Status

Ready for controlled moderator testing.

The current version includes live mod queue loading, rule-based risk scoring, a Gemini AI explanation pipeline for medium and high risk posts, server-side moderator authentication on all endpoints, and a 24-hour reversible action window with audit log.

Planned improvements include:

- More configurable scoring rules
- Subreddit-specific rule profiles
- Better moderation analytics
- Expanded dashboard filters
- Improved onboarding for moderators
- Weekly queue summaries

## Author

Built by **Rudy Castillo E. / PrimeWolf**

- GitHub: **PrimeWolf-1**
- Reddit: **u/PrimeWolf7**
