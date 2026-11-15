# Upande Dev Tools Mobile App — Design

Date: 2026-11-16
Repo: `upande-dev-tools` (Expo SDK 58, RN 0.88, expo-router 58, React 19.3)
Backend: Frappe app `upande_dev_tools` (branch `mark`: Request, Deployment Request, Task custom fields, board/portfolio APIs) + `upande_mobile` (kit backend)

## Intent

The backlog is dead because updating it costs a developer more than it gives back. The app
flips that: capturing a request or task takes seconds, the home screen tells a dev what to do
today, reminders pull them back, closing work feels good, and deployments and repo health are
visible without opening the desk. If it makes a dev's day easier they will keep it open, and
the backlog stays current as a side effect.

## Goals

- Capture a Request/Note/Task in under 5 seconds, from any screen, even offline.
- "My Day" as the home screen: today's tasks, meetings, overdue, waiting-on-me.
- Visibility into deployments and repo health (Module Version Check).
- Push reminders (due, overdue, stale) and event pushes (assigned, approved, deployed, commented).
- Gamification derived from existing data (Task completion, activity log).
- Comment thread per Request/Task.
- Feature parity with the old `upande-dev-tools-mobile` app (reference only, not copied): Notepad, Backlog,
  My Day, Review Queue, Deployment Requests, PM Dashboard, Activity, Snapshots, role-gated menu,
  biometric lock, multi-instance.
- Same look and feel as `upande-packhouse` (theme, primitives, shell, home anatomy).
- Mobile kit installed: OTA/APK updates, crash monitoring, devices, support, push registration.

## Non-goals / anti-goals

- Not a requester/customer app in v1. Audience is Dev Team, Projects Manager, System Manager. (My call: the
  question was left open; requester-facing flows can reuse the same services later.)
- No iOS support for kit features (the kit is Android only). The code stays cross-platform where free.
- No new gamification doctype in v1; points are computed. No punitive mechanics (no shaming leaderboards
  for low scores; leaderboard shows top contributors only).
- No offline editing of existing records, only an offline capture queue.

## Constraints

- Follow `AGENTS.md`: check SDK 58 docs before touching Expo APIs, `npx expo install` for packages, run lint and
  `tsc --noEmit` before done, Expo Router under `src/app/`, non-route code outside it.
- Packhouse conventions: zustand per-domain stores, `*-api.ts` services over one axios client, `Screen`
  primitive with header/drawer, centred Toast, Dialog replacing `Alert`, FAB.
- Auth: `upande_dev_tools.api.mobile_auth.mobile_login` returns `sid` in the body (RN does not reliably
  expose Set-Cookie). Roles from `get_session_context`.
- Kit `init` needs the production site URL and a public GitHub repo; neither is configured yet.
  Push needs an Expo project id and FCM credentials.

## Approaches considered

1. **Port packhouse `core/` wholesale, build dev features on top (chosen).** Fastest route to identical UX;
   packhouse is on the same SDK. Cost: strip tenant/station/scanner concepts.
2. Rebuild primitives from the old dev-tools app. Rejected: the old app is contaminated and targets SDK 54.
3. Use `@expo/ui` / native components already in the scaffold. Rejected: would not match packhouse look.

Backend for push/chat: **extend** `upande_mobile.push.notify_user` (route + channel) and use native Frappe
Comments for threads, rather than extending Mobile Chat Thread (support-centric, keyed by app+user).

## Architecture

```
src/
  app/                    # thin routes: export default Screen component
    _layout.tsx           # fonts, providers, auth gate, Dialog/Toast hosts
    login.tsx  biometric-lock.tsx  no-access.tsx
    index.tsx             # My Day
    backlog.tsx  capture.tsx  request/[name].tsx  task/[name].tsx
    review-queue.tsx  deployments.tsx  repos.tsx  activity.tsx  snapshots.tsx
    pm-dashboard.tsx  achievements.tsx  settings.tsx
  core/
    theme/  ui/  api/  auth/  network/  storage/  offline-queue/  feedback/ (haptics+sound)
  features/<name>/        # <name>-api.ts, <name>-store.ts, screens/components
    my-day  capture  backlog  requests  deployments  repos  review  pm  activity  snapshots
    notifications  gamification  comments
  navigation.ts           # drawer items with role gating
```

## Features and behaviour

1. **Quick Capture** — FAB on every screen opens a sheet: title (required), type chips (Note/Bug/Feature/
   Question/Master Data), optional project, priority, tags, description, photo. Submit calls `create_request`
   (source = Mobile App). Offline: stored in a persisted queue, retried on reconnect and app foreground, with a
   "N waiting to sync" pill. "Add as my task for today" toggle uses `promote_to_task` for own Notes.
2. **My Day (home)** — hero tile: done/planned today; dark tiles: Overdue, In Review, Waiting on me
   (review queue + deployment approvals for PMs); meetings list; today's tasks with one-tap status change
   (Open → Working → Pending Review → Completed) via board `set_stage`; quick-action chips.
3. **Backlog** — `get_board` unified list (Task/Issue/Request), segmented by stage, filters for project/module/
   tag, search; detail screens with status change, planned-for date, comments.
4. **Review Queue** (PM) — `get_review_queue`, `triage_request` approve/reject/defer with priority + project.
5. **Deployments** — create `Deployment Request` (app, instance, branch, commit, linked request); my requests
   and recent deployments with state pills and error/fix notes; devs with permission update status.
6. **Repos** — `Module Version Check`: status, ahead/behind, uncommitted, safe_to_deploy, risk level.
7. **PM Dashboard** — `get_portfolio`, `get_project_health`, `get_team_workload` as hero + tiles.
8. **Activity & Snapshots** — `get_activity_log`, code snapshots, field-difference count.
9. **Notifications** — server scheduler (hourly + 08:00 digest) calls generalized `notify_user` for due-today,
   overdue, stale-open; doc events push on assignment, approval, deployment state change, comment. Payload
   carries `route`; tap deep-links via router. Settings toggles per category.
10. **Comments** — Frappe Comment thread per Request/Task using standard APIs; comment pushes to the other
    participants.
11. **Gamification** — computed server-side by a new `get_achievements` endpoint from Task `completed_on`/status
    and Activity Log: closing points (priority weighted: Low 1, Medium 2, High 4, Urgent 6; +1 if it was
    overdue and cleared), daily streak (consecutive weekdays with ≥1 close), personal bests, weekly top
    contributors, badges (First Close, 5-day streak, Overdue Slayer, Deploy Day, Capture Champion).
    Closing a task fires haptic + sound + a toast showing points.
12. **Kit** — OTA/APK, crash monitor, devices, Report a problem, push registration (once credentials exist).
13. **Shell/auth** — packhouse-style drawer, role-gated items, login (server + credentials), biometric lock,
    multi-instance switcher, 401 recovery (kit session recovery), offline banner.

## Backend changes (repo `upande_dev_tools`, `upande_mobile`)

- `upande_dev_tools/api/achievements.py`: `get_achievements`.
- `upande_dev_tools/api/notifications.py` + scheduler entries in `hooks.py`, doc_events for pushes.
- `upande_mobile/push.py`: `notify_user(..., route=None, channel="support")`, extend Mobile Reminder kinds.
- Ship the `mark` branch Request/Deployment work to `main`.
- `update_task_status` is reviewer-only; devs need permission to move their own tasks (small change).

## Left to the builder

Exact tile layouts beyond the packhouse anatomy, copy/microcopy, notification text, badge artwork,
sound assets, and the kit's `init` answers (production URL, GitHub repo).

## Build order

1. Foundation: deps, theme, fonts, core UI, api client, auth, shell.
2. My Day + Quick Capture + offline queue + backlog/detail.
3. Review, Deployments, Repos, PM, Activity, Snapshots.
4. Gamification + feedback.
5. Notifications + comments (needs backend).
6. Kit install (needs site URL/repo/credentials).
