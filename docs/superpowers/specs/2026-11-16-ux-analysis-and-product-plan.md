# Upande Dev Tools: UX analysis and product plan

Date: 2026-11-16. Basis: a code read of every screen (nothing was run on a device; findings are what the
code makes a user see) plus a study of the web portal in `upande_dev_tools` (v1 and v2 pages, `api/`, `api/v2/`).

## 1. Verdict

The app is a working MVP with a good visual base (packhouse look, dark hero tiles) and a correct data layer, but
it behaves like a stack of generic card lists. Three things stop it from being a daily-use product:

1. **Navigation fights the user.** Drawer only, hamburger in the worst thumb zone, no back button on pushed
   screens, no tab bar, no search, `router.replace` with a 220 ms delay that erases history.
2. **Every screen is the same ScrollView of identical Cards.** No virtualization, no row density, no filters,
   no sorting, no swipe actions. A task, a deployment and a log line look alike.
3. **It shows data but cannot act on it.** Rows that look tappable are not; the actions web users rely on
   (edit due date, reassign, block, approve a deployment, retry, reject with a reason) are missing.

## 2. Systemic defects

| # | Defect | Where |
|---|---|---|
| S1 | No back button on pushed screens; detail title is the raw ID, not the subject | Screen.tsx, RecordDetail |
| S2 | Drawer is the only navigation: 10 flat items, no active highlight, no badges, no edge swipe, 42 px rows | SideMenu, navigation.ts |
| S3 | No FlatList anywhere. Backlog renders the whole board; Activity/Snapshots use a "Load more" button | all list screens |
| S4 | One card style for everything; no pressable card (no pressed state), tall rows (~85 px per task) | Card.tsx |
| S5 | Filters on Activity/Snapshots are client-side over loaded pages only, so they mislead | Activity, Snapshots |
| S6 | No persisted state: filters, tab and scroll reset on every visit; no stale-while-revalidate | useLoad |
| S7 | Loading is inconsistent (spinner vs flat skeleton); every error reads "Something went wrong" | Screen |
| S8 | Offline: only Capture queues; everything else is an error with no cached data | stores |
| S9 | Light only; hard-coded hex colours scattered; StatusBar fixed to dark | theme, screens |
| S10 | Accessibility: almost no roles/labels; 11 px text; 34-36 px targets (Button sm, Segmented, drawer rows); low-contrast green/amber text | primitives |
| S11 | Toast: single slot, centred over content, no action button (so no Undo), not announced to screen readers | Toast.tsx |
| S12 | Terminology drift: Todo/Open/Working/In Review/Pending Review/Blocked; "Capture"/"Promote"/"Make it a task" | everywhere |
| S13 | Data bug: `STATUS` maps Blocked to "Pending Review", so Blocked round-trips to In Review | my-day-store.ts |
| S14 | Two close paths with different feedback: My Day awards points; task detail shows a plain "Task closed" | MyDay, RecordDetail |

## 3. Per-screen defects (highest value first)

**My Day.** First task sits under ~400 px of dark tiles; tiles and hero all open the same unfiltered Backlog; raw
ISO dates; no project/priority colour; stage circle is the only action (no undo, one tap from In Review closes
the task); meetings not tappable (Meet link fetched but unused); "Up next" capped at 8 with no "see all";
overdue backlog inflates "on your plate"; points/streak are not visible here, so the motivation is a screen away;
an extra network call delays the success feedback.

**Backlog.** No search, sort, project/assignee/tag filter; four segments with no counts; heavy cards without
stage/project/assignee; Issue rows do nothing on tap; Done is unpaginated; no swipe/quick advance.

**Task / Request detail.** Only action is "Move to next" (no back, block, edit due/priority/assignee, no
withdraw/edit/confirm for requests); descriptions are regex-stripped (links, code, lists vanish, not selectable);
comment composer is mid-scroll; no scroll-to-newest; comment timestamps skew (UTC vs server local).

**Capture.** Cannot set project/priority/due; no attachment or screenshot (upload helper exists); Return submits
the sheet; no draft kept on accidental dismissal; success haptic fires even when only queued offline; no duplicate
warning (web has one).

**Deployments.** Count tiles look like filters but are not; cards have no detail/retry/approve; no confirmation
step for the highest-risk action; no default or remembered instance; chip wall for apps; raw timestamps;
no approval state although the server has one.

**Review Queue (PM).** Triage is blind (no description/age, cannot open the request); project is free text;
Reject has no reason or confirmation; no badge count; no defer/reopen/age bands.

**PM Dashboard.** Period fixed at 30 days; nothing is tappable (risks cannot open the task); "open" is mislabelled
as a 30-day figure; `48.5%` tile widths break on wide screens; web's "needs you" strip is absent.

**Repos.** Not sorted by risk; missing risk shows as "Low" (false comfort); `last_checked_at` hidden so stale data is
invisible; rows do nothing.

**Activity / Snapshots.** Server filters and search missing (snapshots has no name search, the key a dev has);
no diff against the previous snapshot; code viewer wraps at 11 px, no copy, `monospace` is Android-only.

**Achievements.** Static badges (no progress "3/10", no earned date, no unlock moment); rules unexplained; fed only
by the My Day close path; no opt-out of the leaderboard.

**Settings / Notifications / Drawer.** Settings has two Sign Outs and no confirmation; kit Settings and Devices pages
are unreachable except via the kit FAB; per-kind toggles only gate in-app toasts (footnote admits it); switches
use platform colours; toasts cannot deep-link. "Use password instead" on the lock screen wipes the device
registration without confirmation (destructive and badly worded).

## 4. What web users have that mobile users lose

Web v2 (`www/*-v2.html`, `public/js/dev-v2-*.js`, `api/v2/*`) is the intended target. Ranked by value for a
developer's day, with a mobile adaptation:

1. **KPI tiles that filter** (URL-persisted) -> My Day tiles open Backlog with the filter applied.
2. **Due/age buckets and "what is expected of you" (overdue, today, tomorrow)** -> pinned top section on My Day.
3. **Quick status change** (drag between columns) -> swipe action or long-press menu, with Undo.
4. **Saved filters and prefs; filter sheet with count and Clear** -> "Filters (3)" bottom sheet, persisted.
5. **PM "needs you" strip with one-tap row actions** (decide, late, no owner, gone quiet) -> Review/PM tab.
6. **Request actions gated by server flags** (`can_edit`, `can_withdraw`, `can_confirm`): edit, withdraw, confirm complete.
7. **Group-by and tag/module/project/assignee filters** -> group chips + filter sheet in Backlog.
8. **Duplicate hint on capture** (same title raised before).
9. **Deployment approval, retry with fix note, duplicate request, instances view, peak-hours badge.**
10. **Inline notes that explain numbers**; drill-down from KPI/chart to the list; "updated Xs ago".
11. **Last page restore** (web remembers `dpx_last`).
12. **Per-record timeline/history** (request decisions, deployment timeline).

Web-only items that do not belong on a phone: drag-and-drop, hover peek, Ctrl+wheel timeline zoom, wide tables,
Monaco editor, Hooks Explorer, Master Data admin, Data Seeder, Settings role editor.

Backend already present and unused by mobile: `api/v2/my_backlog` (buckets, `get_task_detail`,
`get_request_detail`), `api/v2/backlog_board.get_backlog` (server filters + KPIs), `api/v2/review_queue`
(`allowed_actions`, history), `api/v2/pm_dashboard` (needs-you, person/item drawers, row actions),
`api/v2/deployments` + `approve/reject_deployment_request`, `board.set_field/bulk_update/update_work/create_task`,
`board.get_used_tags`, `requests.update_request/withdraw_request/confirm_request_complete/reassign_task`,
`get_assignable_users`, `get_upcoming_meetings`, `create_requests_bulk` (API-only, no web UI), version check
(`api/v2/version_check`), field-difference endpoints, snapshot runs.

Web traps not to copy: vocabulary drift (area/module, rejected/declined/dropped, overdue/late), `Task.completed_on`
often empty (completion dates are approximated), the Task status "Overdue" is set by a nightly job and goes stale
(compute from the due date), Requests have no due date so due filters hide them, decision buttons need the
Projects Manager role (show controls only when the server's flags say so).

## 5. Product direction

Information architecture: a **bottom tab bar** replaces the drawer as primary navigation.

```
Today | Work | [ + ] | Ship | More
```

- **Today**: next-action strip (overdue / today / tomorrow), tasks first, hero reduced to a strip with streak and
  points; meetings with a Join button.
- **Work**: Backlog with search, filter sheet, group-by, sort, counts; rows with swipe actions.
- **+**: capture (project, priority, due, photo, duplicate hint, draft kept).
- **Ship**: deployments (list, detail, approve/retry), repos health, version check.
- **More**: Review Queue and PM (role-gated, badge counts), Activity, Snapshots, Achievements, Settings, kit pages.

Cross-cutting: back button and subject titles, FlatList everywhere, one `Row` and one pressable card, undo toasts,
dark mode tokens, 44 px targets and roles/labels, relative dates, one vocabulary, persisted filters, cached reads.

## 6. Delivery phases (page by page)

0. **Foundations**: theme tokens + dark mode, Pressable `Card`/`Row`, back button, Toast with actions and queue,
   relative-date helpers, a11y roles, shared `closeTask` with achievements, fix S13, tab bar shell.
1. **Today and Work**: My Day restructure on v2 `my_backlog`, Backlog rebuild (search, filters, group, swipe),
   task/request detail with real actions and rich text.
2. **Capture**: fuller sheet, duplicate hint, attachments, draft.
3. **Ship**: deployments detail/approval/retry/confirmation, repos sorted by risk with staleness.
4. **PM and review**: needs-you strip, review with description/reason/age, tappable risks.
5. **Activity, Snapshots, Achievements, Settings**: server filters and search, diff, badge progress and unlock moment,
   settings and kit entry points, honest notification settings.

Each phase ends with `tsc`, lint, a live API check and a Metro bundle; screens are screenshot-verified in a
phone-sized browser once the web preview runs.

## 7. Confirmed visually (phone-size web preview against the live local site)

Screens were screenshot at 390x844 after signing in; these findings come from the rendered output, not the code.

- **Two floating buttons collide with content.** The kit's Settings gear and the capture FAB both float bottom-right.
  They cover the right edge of list cards, and on Deployments the capture FAB sits on top of the "Request deployment"
  footer button. The kit gear duplicates Settings and should be turned off (`fab: false`) in favour of a real entry.
- **"Requeste/d" wraps** in the Deployments count tile ("In Progress" wraps too): four tiles across are too narrow for
  13 px labels.
- **The overdue signal is worthless on this data.** The Backlog "Active" list is a wall of identical red Urgent/Overdue
  pills (most of 300+ open tasks are overdue), so nothing stands out. It needs grouping by bucket (overdue / today /
  next), counts, and "overdue by N days" instead of a repeated pill and a raw date.
- **Rows carry no information beyond title and pills**: no project, stage or assignee; task rows are ~95 px tall, so
  about 6 tasks per screen.
- **Deployment cards show a future date** (2027-03-08) and raw timestamps; the record id competes with the date.
- **The web build crashed on launch** because the notification host called a native-only API. Fixed (guarded on
  `Platform.OS === 'web'`), which also unlocks screenshot-based review of every screen.
