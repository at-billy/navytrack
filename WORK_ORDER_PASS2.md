# Work Order — Pass 2 (Per-Role UX & Data Quality)

Audience: Claude Code (executor). Baseline: commit `dfe5aff` (all Pass-1 work done).
Each item: **Findings → Actions → Definition of Done**. Ordered by user-impact.

Impact legend: ⭐ high · ◆ medium · ○ polish

> Note: the "5s staleness" issue from the review is already resolved by WO-5
> (reactive subscriptions), so it is not repeated here.

---

## P2-1 ⭐ — Member picker for recipient / holder fields (data quality)

**Findings**
- Recipient/holder fields are free text and fragment "who has what":
  - `items.handOut` → `handedOutTo` (the recipient)
  - `logistics` → `storedBy`
  - add/edit item → `heldBy`
- "billy", "Billy", "bily" all become distinct holders. There is no roster
  link, so any per-person inventory view is unreliable.

**Actions**
1. Add a reusable "member combobox" on the client: a `<select>`/searchable
   list populated from `state.allUsers` (exclude `removed`), with an explicit
   **"Other / external…"** option that reveals a free-text input.
2. Apply it to: the hand-out modal (`handedOutTo`), logistics create/edit
   (`storedBy`), and the add/edit-item `heldBy` field.
3. Default to selecting a member; keep free-text only behind the "Other" path
   (needed for off-roster holders like an org stash or an external person).
4. No backend schema change required — these stay strings; we're just
   constraining how they're produced. (Optional: trim/validate length, already
   capped in WO-4 for items.)

**Definition of Done**
- Hand-out / storedBy / heldBy offer member selection from the roster;
  free text is reachable only via an explicit "Other" choice.
- Existing records are unaffected; picking a member writes the exact username.

---

## P2-2 ⭐ — Preview before "Use items" consumes inventory (safety)

**Findings**
- `tasks.useItems` bulk-marks matching inventory as used behind a single
  `confirm()`, with no preview of which rows/quantities/locations will be
  consumed. It mutates real assets on one click.

**Actions**
1. Replace the `confirm()` in `useItemsForProject` with a modal that, per
   required item, lists exactly what will be consumed: item name, quantity,
   and source location(s), with a total.
2. Surface shortfalls explicitly (e.g. "need 5, 3 available — will consume 3,
   2 short") so the user knows the project won't be fully satisfied.
3. Confirm/cancel from within the modal; only then call `tasks:useItems`.
4. (Backend optional) add a read-only `tasks:previewUseItems` query that
   computes the plan server-side, so the preview can't drift from the
   mutation's logic. If skipped, compute the preview client-side from
   `state.navItems` using the same matching rules.

**Definition of Done**
- Using items shows an itemized preview (item · qty · from location) with
  totals and any shortfalls before anything is consumed.
- Cancelling changes nothing; confirming consumes exactly what was previewed.

---

## P2-3 ◆ — Removed-member audit & restore (admin)

**Findings**
- Removed members disappear from the admin list entirely; removal is a
  one-way door through the UI. `removeMember` sets `roles:["removed"]` and
  there is no restore path. `grantRole` deliberately won't touch "removed".

**Actions**
1. Add a **"Show removed"** toggle to the admin members section; when on,
   list removed users (greyed) below active members.
2. Add a `users:restoreMember` mutation (admin only): set a removed user's
   roles back to `["member"]` (explicitly clearing "removed"). Archive it.
3. Add a **Restore** button on removed rows that calls it.

**Definition of Done**
- Default members view still hides removed users.
- An admin can reveal removed users and restore one back to member; the
  restored user can log in again.

---

## P2-4 ◆ — Member quality-of-life: "Mine" projects + joinable overview

**Findings**
- No way to filter projects to the ones you've joined; at 20 projects you
  scroll to find your 3.
- The overview "Open Projects" list duplicates the board but is read-only —
  no way to act on it.

**Actions**
1. Add a **"Mine"** filter to the Projects sub-nav showing tasks where the
   current user is in `members`.
2. Make overview "Open Projects" rows clickable → navigate to the Projects
   board (optionally pre-expanded on that project).

**Definition of Done**
- A member can filter to projects they've joined.
- Overview project rows navigate to the board instead of being inert.

---

## P2-5 ◆ — Self-service: profile + change password

**Findings**
- No "who am I" surface and no way to change your own password. (The member
  page exists at `pageMember()` but doesn't offer this.)

**Actions**
1. On the member page, show the user's username and roles (read-only summary).
2. Add a **Change password** form (current + new password). New backend
   mutation `users:changePassword`: verify the current password with
   `verifyPassword`, then store `hashPassword(new)` (reuse `convex/_password.ts`
   from WO-3). Enforce min length 6.
3. Surface success/failure via the toast/notifyError path (WO-8).

**Definition of Done**
- A logged-in user can change their password (must supply the correct current
  one); the new password works on next login and is PBKDF2-hashed.
- The member page shows the user's identity and roles.

---

## P2-6 ○ — Recruit landing polish

**Findings**
- The recruit holding page is bare: no org context, no "what happens next",
  no expectation-setting.

**Actions**
1. Expand `pageRecruitOverview` copy: a one-line intro to the org and a clear
   "your account is pending approval — an admin will grant access; check back
   or ping us on Discord" message.

**Definition of Done**
- The recruit landing explains their status and next steps in plain language.

---

## Suggested execution order
P2-1 (data quality) → P2-2 (asset-mutation safety) → P2-3 (admin recoverability)
→ P2-5 (self-service password) → P2-4 (member QoL) → P2-6 (polish).

## Out of scope for Pass 2 (tracked for Pass 3)
- Responsive layout, spacing/type scale, accessibility (focus management,
  semantic buttons, aria, color-only signals).
- Replacing `confirm()` globally with a styled modal (P2-2 covers the one
  high-stakes case; a general styled-confirm system is a Pass-3 concern).
