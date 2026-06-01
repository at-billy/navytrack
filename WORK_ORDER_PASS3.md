# Work Order — Pass 3 (Design, Responsive & Accessibility)

Audience: Claude Code (executor). Baseline: commit `0217a60` (Pass 1 + Pass 2 done).
Each item: **Findings → Actions → Definition of Done**. Ordered by impact.

Impact legend: ⭐ high · ◆ medium · ○ polish
🎨 = involves subjective design choices — **your call before/while building.**

> What's already good (keep it): the monochrome + single-red-accent identity,
> `:root` color tokens, working dark mode, weight-based type hierarchy, and the
> newspaper-headline task cards. Pass 3 is about making it adapt, be usable by
> keyboard/screen-reader, and feel consistent — not a restyle.

---

## P3-1 ⭐ — Responsive layout (mobile / tablet)

**Findings**
- `0` `@media` queries. The viewport meta tag is present, so the page *scales*
  but the layout never *adapts* — it's desktop-only in practice.
- Specific breakage on narrow screens:
  - Wide tables (inventory, archive/log, members) overflow horizontally.
  - The 3-up stat columns (`.ov-stats`) and `.grid2` form rows don't stack.
  - The big `.nav-main` words (clamped to 8vw but with large minimums) and the
    sub-nav row crowd/overflow.
  - Modals use fixed/max widths that are too wide for phones.

**Actions**
1. Add a small set of breakpoints (e.g. `768px` tablet, `480px` phone).
2. Stack `.ov-stats` and `.grid2` to a single column below tablet.
3. Make wide tables horizontally scrollable in a container (min viable), and/or
   reflow the most-used ones (inventory, log) to stacked "cards" on phone. 🎨
   *(card-reflow vs. scroll is a design call — confirm which tables matter on mobile.)*
4. Let the sub-nav wrap; cap `.nav-main` font min so it fits a phone width.
5. Make modals full-width with side margins and internal scroll on small screens.

**Definition of Done**
- At 375px wide, every page is usable with no horizontal overflow: nav, stats,
  tables, forms and modals all fit and scroll vertically.

---

## P3-2 ◆ 🎨 — Spacing & type scale tokens

**Findings**
- `:root` defines colors only — no spacing or type scale.
- `437` inline `style=""` attributes; `13+` distinct hardcoded `font-size`
  values (151× `18px`, plus 9/13/14/15/16/17/19/22/24/38/52px scattered).
- Result: spacing and sizing are hand-typed per element, so screens feel
  subtly inconsistent and every tweak is a find-and-replace.

**Actions**
1. Add scale tokens to `:root`: `--space-1..6` and `--text-xs/sm/md/lg/xl` (and
   matching dark-mode values aren't needed — sizes are theme-independent). 🎨
   *(You pick the actual ramp — e.g. 13/15/18/24/38, or your preference.)*
2. Apply them to the **shared building blocks** first: page headers, cards,
   modals, form fields, tables — not a blanket rewrite of all 437 inline styles.
3. Leave one-off layout styles inline where converting adds no value.

**Definition of Done**
- A spacing and type scale exists in `:root` and is used by the shared
  components; changing one token visibly and consistently shifts the UI.

> Scope note: this is the most subjective item and the biggest churn. We can do
> it lightly (tokens + a few components) or thoroughly — your call.

---

## P3-3 ◆ — Accessibility baseline

**Findings**
- `1` aria attribute in the entire app.
- `27` clickable `<div onclick>` (nav items, cards, rows) — not keyboard-
  focusable or activatable; screen readers don't announce them as controls.
- Expand/collapse uses bare `▶/▼` glyphs with no button semantics or state.
- No focus management when modals open/close; no visible focus ring guaranteed.
- Some status is signalled by color alone (red = urgent/used) — mostly also has
  text, but worth auditing.

**Actions**
1. Convert interactive `<div onclick>` to `<button>` (or add `role="button"`,
   `tabindex="0"`, and Enter/Space handlers) — start with nav, task cards, table
   rows, and the log/expand toggles.
2. On modal open: move focus into the modal and trap it; on close, restore focus
   to the trigger. Ensure `Esc` closes (pair with P3-4).
3. Add `aria-label`s to icon-only buttons (×, ▶/▼, copy).
4. Ensure a visible focus outline (don't suppress it).
5. Quick pass to confirm no status relies on color *only*.

**Definition of Done**
- Core flows (sign in, navigate, open/close a modal, join a project, hand out an
  item) are completable with keyboard only, and icon controls have labels.

---

## P3-4 ◆ — Styled confirm dialog (replace native `confirm()`)

**Findings**
- `21` `confirm()` calls remain. They're unstyleable, break the visual language,
  and block the thread. (`alert()` was already removed in WO-8.)

**Actions**
1. Add a promise-based `confirmModal({title, body, confirmLabel, danger})` that
   resolves true/false, styled to match the app and reusing the modal system.
2. Replace the 21 `confirm()` call sites; keep destructive ones visually marked
   (red confirm button).
3. Wire `Esc`/overlay-click to cancel and focus management (shares P3-3 work).

**Definition of Done**
- No native `confirm()` remains; destructive actions use a styled, keyboard-
  accessible confirm dialog.

---

## Suggested execution order
P3-1 (responsive — highest impact) → P3-3 (accessibility) → P3-4 (styled confirm)
→ P3-2 (tokens — most subjective, do last and as deep as you want).

## Notes / decisions for you 🎨
- **P3-1 step 3**: which tables should reflow to cards on phone vs. just scroll?
- **P3-2 step 1**: the actual spacing/type ramp is your taste — propose or approve.
- Anything here you want to **cut or descope** — say so and I'll adjust before building.
