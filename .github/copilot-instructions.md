# Copilot Instructions — Agent004 (Max Height)

> This file is a **small, stable steering layer** for Copilot. It does **not** restate the project's design.
> All project-specific decisions live in the spec files listed below. Read them — don't infer.

---

## 1. Knowing what is true

This project keeps **current-state truth in the GitHub wiki**
(<https://github.com/quattro004/Agent004/wiki>) and uses **spec-driven
development (SDD)** via GitHub Spec Kit for large new features. Do not infer
requirements, architecture, or tech choices — read the sources.

Source-of-truth order (highest authority first):

1. `.specify/memory/constitution.md` — non-negotiable principles and quality gates. Supreme; the wiki never overrides it.
2. **The wiki** — current-state truth for completed work. Start at its `Index` page. When the wiki and a _completed_ spec disagree, the wiki wins and the disagreement is appended to the wiki's `Log` page.
3. `specs/` — feature specifications. Authoritative for a feature _while it is being implemented_; frozen and point-in-time afterwards.
4. `docs/` — supporting design documents. Useful background only.

Session start ritual: `pnpm run wiki:pull`, then read the wiki's `Index`. Check
the wiki's `Gotchas` page before rediscovering a known trap.

---

## 2. How to work in this repo

- **Read before writing.** Before generating or modifying code, read the constitution, the wiki `Index`, and the relevant feature or spec page. If a user request references a number, behavior, or component you can't find, **ask** rather than invent.
- **Don't duplicate.** Point to the wiki page or spec section — don't restate it in code comments, commit messages, or other docs.
- **Wiki or Spec Kit?** Use Spec Kit for a new user-facing capability, a new AWS resource or cost-model change, work that needs a constitution check, or work that needs research first. Use the wiki (a `Feature-*` page plus GitHub issues, no branch) for changes to existing behavior, bug fixes, refactors, tooling, dependency and CI work, and knowledge capture.
- **Propose, don't assume.** If every source is silent on something material, propose a wiki page or a spec clarification rather than making the call inline.
- **Record traps.** When you hit a non-obvious trap, write it on the wiki page that owns it and link it from `Gotchas`, in the same change.

---

## 3. Test-Driven Development is mandatory

This project uses **extreme programming (XP)** practices. Specs drive what we build; tests prove the code behaves as specified. **TDD is not optional — it is the development methodology.**

**Always invoke the `tdd` skill before writing or modifying any production code.** Do not write implementation code first and add tests after. The cycle is:

1. **RED** — Write a test that asserts the desired behavior. Run it. It **must fail for the specific intended reason** — not a random import error, not a type mismatch, not an unrelated assertion. If it fails for the wrong reason, fix the test setup until the failure message matches the behavioral gap you're targeting.
2. **GREEN** — Write the minimum production code to make the test pass. Run the test. If it still fails, iterate on the implementation (not the test) until it passes.
3. **REFACTOR** — Review the code for clarity, duplication, and design. If the refactor changes behavior, write a new test for that behavior first (it should fail), then update the code until it passes. Re-run all related tests. This step is iterative — repeat until the code is clean and all tests are green.

**This cycle repeats for each behavior.** A single user request may require multiple Red-Green-Refactor cycles.

When the user asks to fix a bug, add a feature, or change behavior — even without mentioning TDD — start by writing a failing test. Do not ask "should I use TDD?" — the answer is always yes.

---

## 4. Project identity

- **Name: "Max Height"** — in code, copy, UI, and commits. Never "Max Headroom" in any user-facing or repo-visible string. ("Inspired by Max Headroom" is acceptable in the README/About only.)
- Non-commercial fan project, friends-and-family audience.
- IP guardrails: no Matt Frewer voice cloning, no exact visual replica.

---

## 5. When generating code, verify

- Does this respect the constitutional principles? If not, stop.
- Is there a hard number involved (limit, threshold, timeout, budget)? If yes, did it come from a spec, or did I invent it?
- Does this introduce a new dependency or cloud resource? If yes, has it been justified per the constitution's supply-chain and budget rules?
- Am I about to write "Max Headroom" anywhere a user could see it? Use "Max Height."

---

## 6. After making changes — always validate

Run the full validation pipeline before considering any task complete:

```sh
pnpm run validate
```

This chains: **lint → format:check → typecheck → build → test**. All five must pass. If any step fails, fix it before committing.

Individual scripts (for targeted fixes):

| Command                 | Purpose                |
| ----------------------- | ---------------------- |
| `pnpm run lint`         | ESLint errors/warnings |
| `pnpm run lint:fix`     | Auto-fix lint issues   |
| `pnpm run format:check` | Prettier formatting    |
| `pnpm run format`       | Auto-fix formatting    |
| `pnpm run typecheck`    | TypeScript type errors |
| `pnpm run build`        | Workspace builds       |
| `pnpm run test`         | Unit/integration tests |

Wiki scripts are separate and deliberately **not** part of `validate` — the
`wiki/` clone is optional and gitignored:

| Command              | Purpose                                 |
| -------------------- | --------------------------------------- |
| `pnpm run wiki:pull` | Clone or update the local `wiki/` clone |
| `pnpm run wiki:lint` | Lint the wiki against its conventions   |
| `pnpm run wiki:push` | Push wiki changes (live, no PR)         |

---

## 7. When in doubt

- Prefer asking the user a focused question over guessing.
- Prefer linking to the relevant wiki page or spec section over restating it.
- If nothing covers the topic, suggest creating a wiki page — or a spec, if the hybrid rule in §2 calls for one.

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/001-max-height-ai-character/plan.md` and its companion artifacts:

- `specs/001-max-height-ai-character/research.md` — resolved technical decisions
- `specs/001-max-height-ai-character/data-model.md` — entity definitions
- `specs/001-max-height-ai-character/contracts/` — API and integration contracts
- `specs/001-max-height-ai-character/quickstart.md` — developer setup guide

<!-- SPECKIT END -->
