# Instruction-text inventory

Built before editing, for the Opus 5.5 instruction review on branch `opus-5-5-prompt-review`.
Scope: the whole repo except `node_modules`, `package-lock.json`, build output and `.git`.

**The main finding: this repo has no LLM prompts.** Decision D5 says the AI nations are a
deterministic utility AI, and nothing calls a model API. A search for `anthropic`, `openai`,
`claude`, `gpt`, `llm`, `messages.create` and `fetch(` in code found only comments that
*say* there is no LLM, plus error messages that point to CLAUDE.md. So category 1 below is
empty, and the natural-language instructions in scope are the agent file (CLAUDE.md), the
docs, and the code comments.

No `.claude/`, `AGENTS.md`, `.cursorrules`, PR template or other agent config exists.

Categories: **1** LLM prompt in code · **2** agent instruction file · **3** code comment or
docstring addressed to a reader · **4** README, docs, setup or contributor instructions ·
**5** prompt-like config.

Decision key: **keep** = no change · **light** = small wording or accuracy edit · **rewrite**.

## 1. LLM prompts in code

None. The nation AI in `packages/ai` is rule-based (D5). `packages/ai/src/explain.ts`
builds player-facing explanation sentences from numbers with templates, not a model.

## 2. Agent instruction files

| Path | Lines | Purpose | Decision |
|---|---|---|---|
| `CLAUDE.md` | 1-42 | Rules for every AI build session: context, session start, architecture rules, lanes, working method, finish checklist | **light**: the "tests must pass" rule appears three times; "outside your lanes goes in GAPS.md" appears twice; "once the determinism test exists" is stale (it exists); the architecture rules give no reasons and don't say how they're enforced. |

## 3. Code comments and docstrings

The code has about 1,800 comment lines. Nearly all of them explain *why* (seams, RULES
sections, multiplayer needs). There is no shouting, no "IMPORTANT/NEVER", and no
TODO/FIXME/HACK anywhere. I checked every file header and every inline `//` comment in
non-test code, and searched for staleness markers ("Phase 0", "placeholder", "yet",
"later", "until", "used to"). Only the items below need a change. Everything else is **keep**.

| Path | Lines | Purpose | Decision |
|---|---|---|---|
| `packages/ai/src/gate2.test.helpers.ts` | 1-22 | Header of the AI's Gate 2 check | **light (stale)**: says the harness "has no gate2 suite yet and the sim has no crises". Both exist now, and the file measures crisis success and free-riders itself. The criteria list is out of date. |
| `packages/ai/src/gate2.test.helpers.ts` | 326 | Paired-runs comment | **light (wrong)**: says "three ways"; the code runs five (cooperator, isolationist, exploiter, betrayer, free-rider). |
| `packages/harness/src/index.ts` | 1-12 | Package header | **light (stale)**: "Phase 0 … archetype bots arrive with the economy". The bots and the gate1/gate2 suites exist. |
| `packages/harness/src/gate2.ts` | 329 | Absence-length comment | **light**: "single-player 1x (30 min a month)". In the app, 1x is 10 s; 30 min is the live clock (RULES 9's 1x). |
| `packages/sim/src/world.ts` | 81-85 | `RosterEntry` docstring | **light (stale)**: "the Phase 0 platform passes only id and name". The platform now passes the full data roster; only small test rosters get the neutral endowment. |
| `packages/contracts/src/nations.ts` | 22 | `pingsReceived` docstring | **light (wrong)**: "used by the interface's sample cards". The interface no longer uses pings; only the Phase 0 dummy AI and tests do. |
| `packages/contracts/src/trade.ts` | 58 | `PingCommand` docstring | **light (wrong)**: same as above. |
| `vitest.config.ts` | 3-9 | Test runner rationale | **light**: "there are no UI tests yet". Interface *logic* tests exist (`ui/cards.test.ts`); what's missing is component tests. |
| `apps/web/vite.config.ts` | 47-48 | Dev server comment | **light (broken reference)**: "See README.md" for `--host`, but the README no longer mentions it. Fixed by adding the tip back to the README. |
| `apps/web/e2e/phone-check.ts` | 1-26 | Phone check header | **light**: first line names prompts 04 and 07; the body also covers 11 and 12. |
| `eslint.config.js` | 1-12, 85-95, 119-215 | Purity rule rationale and lint messages | **keep**: clear and accurate. The messages are tool output, not model prompts. |
| `packages/sim/src/tunables.ts` | 1-563 | Header rules and a `note` per tunable | **keep**: each note is a one-sentence band rationale, as the `Tunable` contract asks. The header's "Prompt 06 gap-filler" marker is still used by entries. |
| `packages/*/tsconfig.json`, `tsconfig.json` | 2 | `"//"` purity-guard notes | **keep** |
| `packages/harness/src/cli.ts` | 1-24 | CLI usage block | **keep**: matches `args.ts`. |
| `packages/harness/src/purity.test.ts`, `apps/web/src/boundary.test.ts` | headers and assertion messages | Architecture guards | **keep** |

## 4. README, docs, setup and contributor instructions

| Path | Lines | Purpose | Decision |
|---|---|---|---|
| `README.md` | 1-83 | Owner-facing overview, run and install steps, glossary | **light (stale)**: "Right now it is the foundations … the real economy arrives in Phase 1" (we are in Phase 2, MVP built); "about a dozen" computer nations (there are 16 others plus 6 regions); `docs/` row omits RULES.md and AI_DESIGN.md; the LAN `--host` tip is missing (vite.config.ts points to it). |
| `apps/web/src/platform/README.md` | 1-26 | Lane P folder guide | **light (wrong)**: lists "service-worker glue" here, but the service worker is generated by vite-plugin-pwa from `vite.config.ts`; "out of `src/`" should say out of the interface's folders. The file list is accurate. |
| `docs/RULES.md` | 11-12 | Reading guide | **light (wrong)**: "section 10 is what it looks like on a phone". That is section 8; section 10 is "not covered yet". |
| `docs/RULES.md` | rest | Game rules spec | **keep**: plain, specific, gate-linked. Section 9's 1x = 30 min differs from the app's play-test pace, but that's a design question already logged (GAPS 07, 11; RULES Q3), not a wording fix. |
| `docs/ROADMAP.md` | 1-55 | Plan, decisions, seams, gates | **keep**: architect-only (CLAUDE.md), and terse and correct. |
| `docs/DECISIONS.md` | 1-240 | Decision records | **keep**: append-only by its own rule; well written. |
| `docs/AI_DESIGN.md` | 1-411 | AI design, host contract, recipe | **keep**: accurate and explanatory. |
| `docs/PROGRESS.md`, `docs/GAPS.md` | all | Session log, gate checklists, gap log | **keep**: historical records; rewriting them would falsify the log. |
| `docs/balance/*.md`, `docs/gates/*.md` | all | Balance reports and gate reviews | **keep**: dated records. |
| `data/SOURCES.md` | 1-326 | Data provenance | **keep**: a provenance record, not instructions. |
| `.github/workflows/ci.yml` | 3-5 | Why CI runs on PRs and main | **keep** |

## 5. Prompt-like config

None: no YAML, JSON or MD holding prompt text, personas or rubrics. The closest things are
`tunables.ts` notes (category 3, keep) and the AI personality derivation (code, not text).

## Runtime strings that code parses (not edited, listed for safety)

These aren't instructions, but code matches on their wording, so a copy edit would break
behaviour. I left every runtime string unchanged.

- `packages/sim/src/recap.ts` recap sentences ← regex-matched by `apps/web/src/platform/recap.ts` `weigh()` (`/broke/`, `/appeal open/`, `/locked while you were away/`, `/failed/`, `/failure/`, `/no damage to you/`, `/you (contributed|pledged|declined)/`).
- `apps/web/src/platform/predictions.ts` `CHOICES`: "the first word of each is what the harness grades" (`packages/harness/src/predictions.ts`).
- `packages/sim/src/commands.ts` rejection reasons such as `'offer is no longer open'` ← matched by `/no longer open/` in `packages/ai/src/gate2.test.helpers.ts` (race counting).
- `apps/web/e2e/phone-check.ts` finds UI elements by visible text ("Trade done", "Not sent", and so on).
