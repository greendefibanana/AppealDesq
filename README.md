# AppealDesq

AppealDesq turns messy ban appeals and angry modmail into structured, reviewable appeal packets so moderators can spend their time on complete, good-faith cases.

I built it for the Reddit Mod Tools Migration Hackathon after thinking about a very ordinary moderation pain: the user who writes "why was i banned this is unfair" is probably not ready for a real review yet, but a moderator still has to read it, ask the same clarifying questions, and remember to follow up later. AppealDesq makes that first pass calmer and more consistent.

## What It Does

AppealDesq listens for appeal-like modmail, creates a case for the conversation, and replies once with a structured appeal template. When the user responds, it scores the reply from 0 to 5, lists missing fields, detects low-effort or abusive messages, and adds a private mod note with the status, score, summary, and recommended next step.

The dashboard gives mods a fast queue:

- Ready
- Waiting
- Incomplete
- Low effort
- Resolved

Each case card shows the user, status, score, missing fields, summary, last message preview, follow-up count, and a small "user history" panel that helps moderators spot first-time appealers versus repeat low-effort appealers.

## Why It Helps

Appeals are one of those moderation workflows where the cost is not just the final decision. The cost is the back-and-forth: asking for links, asking which rule was misunderstood, asking what the user would do differently, and reading the same three-word "unban me" message over and over.

AppealDesq does not replace moderator judgment. It just gets the appeal into a shape where human judgment is worth spending.

## Core Features

- Devvit Web app with the standard server/client split.
- React and Vite dashboard inside Reddit.
- Hono and tRPC server routes for type-safe client/server calls.
- Devvit Redis storage, scoped per subreddit.
- Modmail trigger for appeal detection.
- Deterministic parser utilities, no AI:
  - `isAppealLikeMessage(text)`
  - `scoreAppeal(text)`
  - `detectLowEffort(text)`
  - `summarizeAppeal(text)`
  - `getMissingFields(text)`
- Configurable templates for appeal intake, denial, and follow-up replies.
- Configurable max follow-ups, low-effort keywords, retention window, and low-effort auto-archive setting.
- Repeat appealer history per subreddit/user.
- Mod-only dashboard access enforced on the server.
- Dark mode, loading states, empty states, inline action errors, and confirmation modals for sensitive actions.

## Safety Model

AppealDesq is deliberately conservative.

- It never auto-unbans.
- It never auto-bans.
- It never auto-mutes.
- It never auto-punishes.
- It never uses external APIs.
- It never uses LLMs.
- It does not require Supabase, Postgres, OpenAI, Anthropic, separate hosting, or paid infrastructure.

Every enforcement or destructive action requires a human moderator click. If a Reddit action is not available or fails in the current SDK/playtest environment, the app reports that failure instead of silently pretending it worked.

## Privacy

AppealDesq stores only compact appeal metadata in Devvit Redis:

- conversation ID
- optional username
- optional subject
- status
- score
- missing fields
- short summary
- short last-message preview
- timestamps

It does not store full modmail transcripts. Data retention defaults to 30 days and can be configured per subreddit.

## How Mods Use It

1. Install AppealDesq in a subreddit where you are a moderator.
2. Use the subreddit mod menu item: **Open AppealDesq**.
3. When appeal-like modmail arrives, AppealDesq creates a case and sends the structured appeal template.
4. Review cases from the dashboard queues.
5. Ask for missing information, deny with a template, mark resolved, archive, or use supported Reddit modmail actions when available.

## Local Development

Install dependencies:

```bash
npm install
```

Log in to Devvit:

```bash
npm run login
```

Run checks:

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

Start a Devvit playtest:

```bash
npm run dev
```

The playtest subreddit in `devvit.json` is:

```text
appealdesq_dev
```

## Tech Stack

- Reddit Devvit Web
- TypeScript
- React
- Vite
- Hono
- tRPC
- Devvit Redis
- Vitest

## Project Impact

AppealDesq is designed for communities where modmail volume and emotional appeals can burn out a team: large discussion subs, advice/support subs, gaming communities, marketplace communities, and any subreddit where rule enforcement leads to repeated disputes.

The goal is not to make moderation harsher. It is to make appeals clearer for users and less exhausting for moderators.

## Roadmap

- Richer subreddit rule checklists.
- Better duplicate detection across separate conversations.
- More granular action templates.
- Search and handoff views for larger mod teams.
- More live playtest coverage across Reddit clients.
