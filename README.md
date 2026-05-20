# ModPilot AI

**ModPilot AI** is a Reddit mod queue triage assistant built for the Reddit Mod Tools and Migrated Apps Hackathon using Devvit.

It helps moderators review queue items faster by scanning posts for risk signals, assigning a clear risk level, and showing the reason behind each flag. The goal is not to replace human moderators. The goal is to make repetitive moderation review faster, clearer, and easier to manage.

## Project Overview

ModPilot AI gives moderators a dashboard-style workflow for reviewing queued Reddit posts. Each item is evaluated using practical moderation signals such as account age, external links, urgency language, money claims, promotional wording, missing flair, and repeated phrases.

The tool produces a risk score and label so moderators can quickly decide whether an item should be approved, removed, marked as spam, or reviewed manually.

## Key Features

- Reddit moderation assistant built with Devvit
- Queue triage dashboard for reviewing posts
- Rule-based risk scoring system
- Low, Medium, and High risk labels
- Clear explanations for why a post was flagged
- Signal detection for spam, promo language, money claims, urgency phrases, external links, missing flair, new accounts, and repeated phrases
- Human-review workflow so moderators stay in control
- Queue impact metrics such as reviewed items, high-risk flags, and estimated time saved
- Fallback architecture designed after external AI API access was limited by Devvit HTTP domain restrictions

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
| 0–20 | Low Risk |
| 21–50 | Medium Risk |
| 51+ | High Risk |

The project also includes an override rule where a money claim combined with an external link is treated as high risk.

## Tech Stack

- Devvit
- TypeScript
- Reddit Developer Platform
- Rule-based moderation logic
- Devvit key-value storage concepts for short-term session memory

## Why It Matters

Moderators often need to review many posts quickly while still making fair decisions. ModPilot AI was designed to reduce repetitive review work, surface risky posts faster, and give moderators a cleaner explanation of why an item needs attention.

The system keeps the moderator in control. It is a triage assistant, not an auto-moderation replacement.

## Current Status

Hackathon prototype completed.

The current version focuses on rule-based risk scoring and queue visibility. Planned improvements include:

- Optional AI classification once API access is available
- More configurable scoring rules
- Subreddit-specific rule profiles
- Better moderation analytics
- Expanded dashboard filters
- Improved onboarding for moderators
- Weekly queue summaries using short-term storage

## Author

Built by **Rudy Castillo E. / PrimeWolf**

- GitHub: **PrimeWolf-1**
- Reddit: **u/PrimeWolf7**
