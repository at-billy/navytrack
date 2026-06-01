# Work Order — Pass 1 (Engineering & Security Hardening)

Audience: Claude Code (executor). Reviewed at commit `2a88cda`.
Each item: **Findings → Actions → Definition of Done**. Work top to bottom; dependencies noted.

Severity legend: 🔴 critical (live exposure) · 🟠 high · 🟡 medium

---

## WO-1 🔴 — Authenticate & authorize all read queries

**Findings**
- Every `getAll` query takes no session token and runs no role check:
  `items.ts:getAll`, `archive.ts:getAll`, `users.ts:getAllUsers`, `tasks.ts:getAll`,
  `lotteries.ts:getAll`, `applications.ts:getAll`, `logistics.ts:getAll`.
- `CONVEX_URL` ships in client HTML (`index.html:729`), so the deployment is world-reachable.
- Verified exploit: unauthenticated `POST /api/query` for `users:getAllUsers` returns all
  usernames/roles/IDs. Same applies to every table, including `applications` (personal data).

**Actions**
1. Add `sessionToken: v.string()` to the args of every read query above.
2. Call `requireSession(ctx.db, sessionToken)` at the top of each handler.
3. Apply role gates where data is sensitive:
   - `applications:getAll` → admin only.
   - `users:getAllUsers` → any authenticated user (UI needs names) but **drop `passwordHash`** from the projection (already mapped out — keep it that way).
   - `archive:getAll` → authenticated; consider admin/command only.
   - inventory/tasks/lotteries/logistics → authenticated members and up.
4. Update every client call site in `index.html` (`refreshAll`, line ~818) to pass `sessionToken`.
5. Keep the per-query `.catch(()=>[])` resilience, but make a session error bubble to `handleSessionError` (see WO-8).

**Definition of Done**
- Unauthenticated `POST /api/query` to any path returns an error, not data (re-run the curl test).
- Logged-in app still loads all data correctly for each role.
- `applications` reachable only by admin.

---

## WO-2 🔴 — Fix output escaping (stored XSS → admin takeover)

**Findings**
- `esc()` (`index.html:789`) escapes `& < > "` but **not single quotes**.
- Usernames have no charset validation (`users.ts:signUp`).
- Usernames/titles are interpolated into single-quoted **JS** contexts inside `onclick`,
  e.g. `adminGrantAdmin('${esc(m.username)}')` (`index.html:2294–2300`), and
  `useItemsForProject('${esc(t._id)}','${esc(t.title)}')`.
- Attack: register username `'+alert(document.cookie)+'` → executes in an **admin's**
  browser when they open the members list → can self-escalate via `grantAdmin`.

**Actions**
1. Add a dedicated JS-string escaper, e.g. `escJs(s)` that JSON-encodes/escapes `' " \ < >` and newlines; OR
2. **Preferred:** stop building event handlers via string interpolation. Render elements with
   `data-id` / `data-username` attributes and attach behavior with delegated `addEventListener`.
   This removes the entire class of injection at the source.
3. Add server-side username validation in `signUp` (allowlist `[A-Za-z0-9_\-. ]`, length 2–32, trim).
4. Audit all `onclick="...('${...}')"` sites; confirm none pass raw user text into a JS string.

**Definition of Done**
- A user named `o'brien` and a project titled `Bengal's Run` render and their buttons work.
- A username/title containing `'+alert(1)+'` does **not** execute when an admin views the lists.
- `signUp` rejects out-of-charset / overlong usernames server-side.

---

## WO-3 🔴 — Move password hashing server-side with a real KDF

**Findings**
- `hashPwd` (`index.html:785`) = `SHA-256(password + "|navytrack_v1")` in the browser.
- Server stores and compares that hash verbatim (`users.ts:authenticate`).
- Consequences: stored hash **is** a password-equivalent (DB leak = instant login by replaying the hash);
  single global static salt + fast hash = one rainbow table cracks everyone; no server-side KDF.

**Actions**
1. Change the client to send the **raw password** over TLS (it's already HTTPS).
2. Implement hashing in a Convex **action** (Node runtime) using a slow KDF with per-user salt
   (scrypt/argon2/bcrypt). Store `{ salt, hash, algoParams }`, not a bare digest.
3. Rewrite `authenticate` and `signUp` to verify/derive via the action.
4. **Migration:** existing users have only the old SHA-256 hash. Strategy: on next successful
   login (old scheme still recognized once), transparently re-hash with the new KDF and overwrite.
   Mark migrated users; deny old-scheme logins after a cutover date.
5. Remove `hashPwd` from the client once migration path is live.

**Definition of Done**
- New sign-ups store salted KDF hashes; no SHA-256-only records created.
- Existing users can still log in and are silently upgraded on first login.
- Replaying a stored hash value against `authenticate` no longer logs anyone in.

---

## WO-4 🟠 — Validate authorization inputs server-side

**Findings**
- `grantRole` (`users.ts:144`) pushes whatever `role` string the client sends — no allowlist.
- Other mutations trust client-supplied enums (priority, category) without validation.

**Actions**
1. Define server-side allowlists (roles, priorities, categories) in a shared `_constants.ts`.
2. In `grantRole`/`revokeRole`, reject any role not in the manageable set; keep `admin` granting
   exclusively in `grantAdmin`.
3. Add light validation to `tasks:create/update` (priority ∈ set, targetRoles ⊆ roles) and
   `items:create` (category ∈ set, quantity > 0, sane string lengths).

**Definition of Done**
- A crafted mutation with `role:"superadmin"` or `priority:"asap"` is rejected.
- No mutation trusts a client enum without a server-side membership check.

---

## WO-5 🟠 — Replace polling with Convex reactive subscriptions (or bound it)

**Findings**
- `refreshAll` re-downloads **7 full tables every 5s per client** (`index.html:818`, `startPolling` 842).
- `archive:getAll` is `order("desc").collect()` — unbounded growth, re-fetched every cycle.
- This is the dominant performance/cost problem and the source of 5s UI staleness.

**Actions**
- **Preferred:** migrate reads to Convex's reactive client (`ConvexClient`/`useQuery`-style
  subscriptions) so the server pushes deltas; delete the `setInterval` poll.
- **If staying on raw HTTP short-term:** (a) paginate `archive` and cap the overview/recent slice;
  (b) increase poll interval and only refetch tables relevant to the current page;
  (c) add a lightweight "version"/since query so clients fetch only changes.

**Definition of Done**
- No full-table re-download loop every 5s.
- Archive growth does not increase steady-state per-client traffic linearly.
- UI updates feel near-real-time (or clearly improved from 5s).

---

## WO-6 🟠 — Add pagination to unbounded tables

**Findings**
- All reads use `.collect()`; `archive`, `items`, `logistics` grow without bound.

**Actions**
1. Convert `archive:getAll` (and the archive UI) to `.paginate()` with a page size + "load more".
2. Do the same for inventory once it's large; keep filters server-side where practical.

**Definition of Done**
- Archive and inventory load a bounded first page; older rows fetched on demand.

---

## WO-7 🟠 — Add tests for inventory/asset math

**Findings**
- Zero tests. Core asset arithmetic is untested: `items:create` auto-stack (`items.ts:35`),
  `items:handOut` partial split, `tasks:useItems` quantity-splitting & allocation.

**Actions**
1. Add Convex test harness (`convex-test` / vitest).
2. Cover: auto-stack merges identical rows; partial handout reduces source + creates handed-out row;
   `useItems` consumes exactly N across multiple stacks, splits a stack when N < stack qty,
   and errors when nothing matches; role gates reject unauthorized callers.

**Definition of Done**
- A green test suite runs in CI/local; the listed scenarios are asserted.

---

## WO-8 🟡 — Centralize error & session handling on the client

**Findings**
- `handleSessionError` exists (`index.html:761`) but most call sites use `catch(e){alert(e.message)}`.
- Expired session mid-action shows a raw `alert("SESSION_EXPIRED")` instead of redirecting to login.

**Actions**
1. Wrap all mutations/queries so session errors route through `handleSessionError` (redirect + toast).
2. Replace ad-hoc `alert()` for errors with the styled `toast()` / a styled confirm modal.

**Definition of Done**
- Any `SESSION_*` error anywhere logs the user out cleanly to the sign-in screen.
- No raw `alert()` shows internal error codes to users.

---

## WO-9 🟡 — Move secrets to environment variables

**Findings**
- Google Sheets webhook URL hardcoded (`applications.ts:6`); anyone can POST fake rows to the sheet.

**Actions**
1. Move the webhook URL to a Convex env var (`process.env`); read it in `syncToSheets`.
2. (Optional) add a shared-secret header the Apps Script verifies before appending.

**Definition of Done**
- No webhook URL or secret in source; sheet writes require the configured secret.

---

## Suggested execution order
WO-1 → WO-2 → WO-3 (the three live exposures), then WO-4, WO-8 (cheap hardening),
then WO-5 → WO-6 (performance), WO-7 (tests) alongside, WO-9 last.

## Out of scope for Pass 1 (tracked for later passes)
- Per-role UX gaps (member pickers for `heldBy`, "use items" preview, removed-member audit).
- Responsive layout, spacing/type scale, accessibility — Pass 3.
- File/module decomposition of `index.html` — separate refactor.
