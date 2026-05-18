# ModPilot AI

**ModPilot AI** is a Reddit mod queue triage assistant built for the Reddit Mod Tools and Migrated Apps Hackathon using Devvit.

The project helps moderators review posts faster by scanning queue items, detecting risk signals, assigning a risk level, and showing a clear reason for each decision.

## What I Built

- Reddit moderation assistant built on Devvit
- Rule-based risk scoring system for mod queue items
- Dashboard-style interface for reviewing posts
- Risk labels for Low, Medium, and High priority items
- Signal detection for spam, promo language, money claims, urgency language, external links, missing flair, new accounts, and repeated phrases
- Human-review workflow so moderators stay in control
- Queue impact metrics such as items reviewed, high-risk items flagged, and estimated time saved
- Fallback architecture designed after external AI API access was limited by Devvit HTTP domain restrictions

## Risk Scoring Logic

ModPilot AI uses practical moderation signals to help identify posts that may need closer review.

Example scoring signals:

- Account under 24 hours
- Account under 7 days
- External links
- Urgency phrases
- Money claims
- Promo language
- Missing flair
- Too many links
- Repeated phrases

Risk levels:

- **Low Risk:** 0–20
- **Medium Risk:** 21–50
- **High Risk:** 51+

The project also includes an override rule where a money claim combined with an external link is treated as high risk.

## Tech Stack

- Devvit
- TypeScript
- Reddit Developer Platform
- Rule-based moderation logic
- Devvit key-value storage concepts for short-term session memory

## Why This Project Matters

Moderators often have to review posts quickly while still making fair decisions. ModPilot AI was designed to reduce repetitive review work, surface risky posts faster, and give moderators a cleaner way to understand why an item was flagged.

The goal is not to replace human moderators. The goal is to support them with faster triage, clearer signals, and better queue visibility.

## Development Notes

This was built as a first-time Devvit project. A major challenge was that external HTTP domain restrictions blocked planned AI API usage, so the project shifted toward a predictable rule-based scoring system. That fallback made the tool more reliable for the hackathon demo and easier to explain.

## Current Status

Hackathon prototype completed.

Future improvements could include:

- Optional AI classification once API access is available
- Better moderation analytics
- More configurable scoring rules
- Subreddit-specific rule profiles
- Expanded dashboard filters
- Improved onboarding for moderators

## Author

Built by **Rudy Castillo E. / PrimeWolf**

GitHub: **PrimeWolf-1**
