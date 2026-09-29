# Opus 5.5 instruction review: report

Branch: `opus-5-5-prompt-review` (from `main` at 9eeefee). Inventory: `REVIEW_INVENTORY.md`.

## The short version

- **This repo has no LLM prompts.** The AI nations are a deterministic utility AI (decision
  D5). Nothing calls a model API, and there are no system prompts, templates, few-shot
  examples or tool schemas to tune. So the runtime behaviour of the game can't be affected
  by this pass, and I changed none of it.
- **The instruction text was already in good shape.** CLAUDE.md is short and concrete. Code
  comments explain *why* (seams, RULES sections, multiplayer needs), not *what*. There was
  no ALL-CAPS emphasis, no "IMPORTANT/NEVER EVER", and no TODO/FIXME. I didn't rewrite
  anything for the sake of it.
- **What needed work was drift**, not scaffolding: comments and docs written in Phase 0 or 1
  that still describe the project as it was then. Plus some repeated rules in CLAUDE.md.
- **Every code change is a comment change.** A diff filter confirms no non-comment line
  changed in any `.ts`/`.js` file. No runtime string was touched.

## What changed, by file

| Commit | Files | Change |
|---|---|---|
| inventory | `REVIEW_INVENTORY.md` | New. |
| CLAUDE.md | `CLAUDE.md` | Light edit (see below). |
| docs | `README.md`, `apps/web/src/platform/README.md`, `docs/RULES.md` | Stale and incorrect statements fixed. |
| contracts, sim | `packages/contracts/src/nations.ts`, `trade.ts`, `packages/sim/src/world.ts` | Three stale or incorrect docstrings. |
| ai, harness | `packages/ai/src/gate2.test.helpers.ts`, `packages/harness/src/index.ts`, `gate2.ts` | Headers written before crises and the gate suites existed. |
| web | `vitest.config.ts`, `apps/web/vite.config.ts`, `apps/web/e2e/phone-check.ts` | Small accuracy fixes. |

Each commit is self-contained, so you can revert any one with `git revert <sha>`.

### CLAUDE.md (light edit, every rule kept)

- **Removed repetition.** "npm test and npm run check must pass" was stated three times
  (Working method, Finish step 1, and the closing "Never merge work that fails tests"). It
  is now one line in Finish step 1, with the never-merge rule attached. "Anything outside
  your lanes goes in GAPS.md" was stated twice; it is now once, under Lanes.
- **Fixed a stale clause.** "including the determinism test once it exists": it exists
  (`packages/harness/src/determinism.test.ts`) and runs inside `npm test`.
- **Added reasons and enforcement to the architecture rules.** One paragraph says what the
  rules protect (a deterministic sim that runs unchanged on a server), points to the
  records that justify them (D6, S1-S9), and says the purity rules are machine-enforced
  (tsconfig, ESLint, `purity.test.ts`). The anti-cheat reason for the View rule is one
  clause. This gives the model the *why*, so it can judge edge cases, which Opus uses well.
- **Added a reason to the lanes rule** (parallel sessions) and to the three-bullet opening
  (so the owner can follow along).
- **Added pointers to docs/RULES.md and docs/AI_DESIGN.md**, the specs lanes S and A build
  from, to read "whichever your work touches". This is the only addition to what a session
  reads; revert that paragraph if you want sessions to stay on the original three files.
- Moved "pick the reading most consistent with ROADMAP.md" next to "ask only when
  irreversible", because they are the same judgment call.
- The eight architecture rules, the lane table, the finish checklist, the 5-line owner reply
  and "merge it yourself once CI passes" are unchanged in substance.

CLAUDE.md is marked "architect-only" in its own lane rules. I edited it because you, the
owner, asked for this pass explicitly.

## Prompts with parsed-output contracts

**No LLM prompt exists, so no prompt has an output contract.**

Some ordinary runtime strings *are* parsed by other code, though, and a copy edit to them
would silently change behaviour. I left all of them byte-for-byte unchanged. They're listed
here so future text passes (human or AI) know about them:

| Producer | Consumer | Contract |
|---|---|---|
| `packages/sim/src/recap.ts` recap sentences, and the host's folded "crises locked while you were away" line | `apps/web/src/platform/recap.ts` `weigh()` | Ranks lines by regex: `/broke/`, `/appeal open/`, `/you (contributed\|pledged\|declined)/`, `/locked while you were away/`, `/failed/`, `/failure/` (the interpolated `CrisisOutcome`), `/no damage to you/`. |
| `apps/web/src/platform/predictions.ts` `CHOICES` | `packages/harness/src/predictions.ts` | The first word of each choice is what the harness grades. |
| `packages/sim/src/commands.ts` reason `'… is no longer open'` | `packages/ai/src/gate2.test.helpers.ts` | `/no longer open/` counts same-month races rather than invalid commands. |
| UI copy ("Trade done with", "Not sent", and so on) | `apps/web/e2e/phone-check.ts` | Found by visible text. |

## Stale or incorrect comments and docs, fixed

"Wrong" means it contradicted the current code; "stale" means it described an earlier stage.

| Where | Was | Kind |
|---|---|---|
| `packages/ai/src/gate2.test.helpers.ts` header | "The balance harness has no `gate2` suite yet and the sim has no crises". Its criteria list left out free-riders, crisis success, betrayer pairs, invalid commands and determinism, all of which the file now measures. | wrong |
| `packages/ai/src/gate2.test.helpers.ts:326` | "Paired runs … three ways". The code runs five. | wrong |
| `packages/contracts/src/nations.ts:22`, `trade.ts:58` | Ping is "used by the interface's sample cards". No interface code uses ping; only the dummy AI and tests do. | wrong |
| `packages/sim/src/world.ts` `RosterEntry` | "the Phase 0 platform passes only id and name". The platform passes the full data roster. | wrong |
| `packages/harness/src/index.ts` | "Phase 0 … Archetype bots arrive with the economy". | stale |
| `packages/harness/src/gate2.ts:329` | "single-player 1x (30 min a month)". The app's 1x is 10 s; 30 min is the live clock (RULES 9's 1x). Clarified. | ambiguous |
| `docs/RULES.md` reading guide | "section 10 is what it looks like on a phone". That is section 8. | wrong |
| `apps/web/src/platform/README.md` | Listed "service-worker glue" in platform/. The service worker is generated by vite-plugin-pwa from `vite.config.ts`. "Out of `src/`" meant out of the interface's folders. | wrong |
| `README.md` | "Right now it is the foundations … The real economy arrives in Phase 1"; "about a dozen" computer nations (there are 16 others plus 6 regions). | stale |
| `apps/web/vite.config.ts` | "See README.md" for `--host`, which the README no longer mentioned. I added the tip back to the README. | broken reference |
| `vitest.config.ts` | "there are no UI tests yet". Interface logic tests exist; component tests don't. | stale |
| `apps/web/e2e/phone-check.ts` | First line named prompts 04 and 07; the body also covers 11 and 12. | stale |

## Deliberately left alone

- **All other code comments (about 1,780 lines).** I read every file header and every
  inline `//` in non-test code. They explain why, cite the rule or seam they serve, and
  match the code. Rewording them would be churn.
- **`packages/sim/src/tunables.ts` notes.** One-sentence band rationales, as the `Tunable`
  contract asks. Some notes carry prompt-history ("Prompt 09 gate1 tuning: 12"). That
  provenance is useful to whoever tunes next, so I kept it.
- **docs/DECISIONS.md.** Append-only by its own rule, and already well written.
- **docs/ROADMAP.md.** Architect-only, terse and accurate.
- **docs/PROGRESS.md, docs/GAPS.md, docs/balance/, docs/gates/, data/SOURCES.md.** Dated
  records. Editing them would falsify the log.
- **docs/AI_DESIGN.md and the rest of docs/RULES.md.** Clear, specific specs.
- **ESLint messages, purity and boundary test messages.** Tool output for developers;
  already clear and each cites its reason.
- **Every user-facing string** (cards, why-sheets, recap lines, report labels). They're
  product copy, not instructions, and several are parsed (see above).

## Flagged issues outside scope (not fixed)

1. **Recap ranking depends on sentence wording.** `weigh()` in
   `apps/web/src/platform/recap.ts` regex-matches English text produced in another package.
   If someone rewords a sim recap sentence, the ranking changes silently. The only test
   (`engine.test.ts:173`) checks that weights are sorted, not which line gets which weight.
   A structured field on `RecapLine` (for example `severity`, or a `topic` enum) would
   remove the coupling; that is a contracts change (lane C). At minimum, add a test that
   pins each phrase to its weight.
2. **Pace naming disagrees between RULES and the app.** RULES §9 calls 30 min/month "1x";
   the app's 1x is 10 s and 30 min is "live". The harness report label in
   `packages/harness/src/gate2.ts:401` still prints "48 at single-player 1x". This is
   logged as a design question (GAPS 07 and 11, RULES Q3); it needs the owner's ruling,
   then a RULES §9 edit.
3. **Phase 0 leftovers still in the model.** The `ping` command, `pingsSent` and
   `pingsReceived`, and the dummy AI now exist only for tests. Removing them would shrink
   `State` and the View, but it needs a save-schema bump and a migration (seam 9). It's a
   lane C/S decision.
4. **Small CLAUDE.md tension, kept as is.** "Justify any new dependency in your summary"
   sits beside a 5-line maximum owner reply. The PR description is probably the right
   place. Say if you want that wording.
5. **CLAUDE.md says to merge your own PR.** I did not open or merge a PR for this pass,
   because you asked for a branch to review and revert selectively. Merging is your call.
6. **Sonnet-specific workarounds or model settings.** None exist: no model ids,
   temperatures, token limits or retry-on-format hacks anywhere.
7. **`.gitignore`** still carries Next.js boilerplate (`/.next/`, `next-env.d.ts`).
   Harmless.

## Checks run

On the branch, after all edits:

- `npm test`: **31 files, 444 tests passed.** This includes the Node-vs-Chromium
  determinism test, which ran here (not skipped) with `CHROME_PATH=/opt/pw-browsers/chromium`.
- `npm run check` (ESLint plus every workspace's `tsc`): **passed**, exit 0.
- `npm run build`: **passed** (PWA service worker generated).
- The phone check (`npm run e2e --workspace web`) was not run. It's outside CI by design,
  and nothing it exercises changed.

## Highest-risk changes to check by hand

No runtime prompt changed, so the only change that can alter behaviour is how future AI
build sessions read CLAUDE.md. Suggested checks, most important first:

1. **The finish checklist still runs in full.** Start a session with a tiny build prompt,
   for example: *"Prompt 14, lane U: add a one-line hint under the pace bar saying what
   4x does. PR title: [14] Pace hint."* Confirm it runs `npm test` and `npm run check`,
   adds a PROGRESS.md entry, opens and merges the PR once CI is green, and replies in 5
   lines or fewer. The tests-must-pass rule now appears once instead of three times, so
   this is the one to watch.
2. **Lane discipline and GAPS logging.** Give it a prompt that tempts a cross-lane edit:
   *"Prompt 15, lane U: show each nation's resilience on the map."* Resilience is hidden
   from the View, so the right move is a GAPS.md entry for lanes C/S, not a sim edit.
   Confirm it stays in lane U.
3. **Opening statement and reading list.** Check that the session still opens with three
   bullets and a file list without waiting for you, and that on a sim or AI prompt it
   consults RULES.md or AI_DESIGN.md. That's the new pointer; make sure it doesn't slow
   small UI prompts.
