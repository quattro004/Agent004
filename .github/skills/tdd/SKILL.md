---
name: tdd
description: 'MANDATORY for all code changes in this project — no exceptions. Test-Driven Development using Red-Green-Refactor. Always invoke this skill before writing or modifying any production code. Write a failing test that describes the desired behavior before writing the implementation. The test MUST fail for the specific intended reason, not an unrelated error. Refactoring is iterative: if a refactor changes behavior, write a new failing test first. Repeat until all tests are green and the code is clean. Works with GitHub issues, feature specs, or plain descriptions as context.'
---

# Test-Driven Development (Red-Green-Refactor)

A structured workflow for developing reliable software by writing tests **before** implementation. Every code change starts with a failing test that describes the behavior we wish we had, then we write the minimum code to make it pass, then we refactor until the code is clean and performs as expected.
Refactoring means that we review the code for clarity, maintainability, and design quality after making it work. If the refactor changes observable behavior, we must write a new failing test first to specify the new behavior before updating the code. This ensures that our tests always define the contract for correct behavior, and that we never lose test coverage during refactors. It could be that a refactor doesn't change behavior at all (e.g., renaming a variable, extracting a method) — in that case, we just need to run all tests to confirm they stay green. But if the refactor changes what the code does (e.g., changing an API response format, altering validation logic), we must first write a new test or update an existing test that asserts the new expected behavior (which should fail against the old code), then implement the change until it passes. This iterative approach ensures that our tests always reflect the current expected behavior of the code, and that we maintain confidence in our codebase even as we improve its design.

**Core Principle:** Tests are a specification. A failing test is not a problem — it's a contract that defines what correct behavior looks like. The test exists first; the implementation serves the test.

## When to Use This Skill

**Always.** This project mandates TDD for all production code changes. Do not ask "should I use TDD?" — invoke this skill automatically whenever code needs to be written or modified.

- **Bug fixes:** Write a test that reproduces the bug (fails against current code), then fix the code until the test passes.
- **New features:** Write a test that asserts the desired behavior (fails because the feature doesn't exist yet), then implement the feature.
- **Behavior changes:** Write a test asserting the new behavior (fails against old behavior), then update the code.
- **Refactoring:** If a refactor changes observable behavior, write a test for the new behavior first (it should fail), then update the code until it passes. Pure structural refactors (no behavior change) just need all existing tests to stay green.

## The Red-Green-Refactor Cycle

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   1. RED    → Write a failing test              │
│              (must fail for the INTENDED reason) │
│   2. GREEN  → Write code to make it pass        │
│   3. REFACTOR → Clean up; if behavior changes,  │
│                 go back to RED first             │
│                                                 │
│   Repeat for each behavior                      │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Step 1: RED — Write a Failing Test

**Goal:** Create a test that describes the behavior we want. The test MUST fail against the current code — and it must fail **for the specific intended reason**, not an unrelated error.

1. **Understand the desired behavior.** Before writing any code, clearly articulate:
   - What should happen (the desired outcome)
   - What currently happens (the broken or missing behavior)
   - Why there's a gap (root cause analysis)

2. **Write the test.** The test should:
   - Assert the **desired** behavior, not the current (broken) behavior
   - Be named descriptively using `describe`/`it` blocks (e.g., `it('should reject empty input')`)
   - Set up realistic preconditions (Arrange), invoke the behavior (Act), and verify the outcome (Assert/Expect)
   - Be minimal — test one behavior per test

3. **Run the test and confirm it FAILS for the right reason.**
   - If it **fails with the expected assertion error** (e.g., "expected X but received Y") → ✅ Proceed to Step 2
   - If it **fails for an unrelated reason** (import error, type error, missing mock, wrong setup) → ❌ Fix the test infrastructure until the failure is the behavioral gap you're targeting. The RED failure message should read like a spec violation, not a setup bug.
   - If it **passes** → ❌ Stop and investigate:
     - Is the test actually asserting the right thing?
     - Is the bug already fixed by other code?
     - Is there a different layer (validation, filtering) that prevents the scenario?
     - Rewrite the test to target the actual gap, or acknowledge the scenario is already handled

4. **Record the failure message.** This is your "before" evidence — it proves the code needs to change.

### Step 2: GREEN — Write the Minimum Code to Pass

**Goal:** Make the failing test pass with the simplest correct implementation.

1. **Make the change.** Focus on the code path the test exercises. Don't fix unrelated issues.
2. **Run the test.**
   - If it **passes** → ✅ Proceed to Step 3
   - If it **fails** → Iterate on the implementation. Read the failure message carefully — it tells you exactly what's wrong.
3. **Run ALL related tests** (not just the new one) to ensure you haven't broken existing behavior.
   - If existing tests break → your fix has a side effect. Adjust the implementation to satisfy both the new test and existing tests.

### Step 3: REFACTOR — Clean Up (Iterative)

**Goal:** Improve the code's design without breaking tests. If the refactor changes observable behavior, go back to RED first.

1. **Review the implementation** for clarity, naming, duplication, and code style.
2. **If the refactor is purely structural** (no behavior change): make the change, run all tests, confirm green.
3. **If the refactor changes behavior** (different output, different side effects, different API): write a new test asserting the new behavior first (RED — it should fail), then update the code (GREEN), then continue refactoring.
4. **This step is iterative.** Repeat the review-refactor-test loop until the code is clean, well-named, and all tests are green.

## Phase 0: Gather Context

Every TDD cycle should be grounded in clear requirements. Context can come from multiple sources — use whatever the user provides.

### Step 1: Determine the context source

The user may provide one or more of:
- **A GitHub issue number** → fetch the issue and its comments
- **A spec reference** (e.g., `specs/001-max-height-ai-character`) → read the spec, plan, and tasks
- **A plain description** → work directly from the user's description

If the user provides none of these, ask:
_"Can you point me to a GitHub issue, a spec under `specs/`, or describe what you'd like to build or fix? I'll use that as context for planning and writing tests."_

### Step 2: Fetch context

**If a GitHub issue number is provided:**
1. Use `github-mcp-server-issue_read` (method: `get`, owner: `quattro004`, repo: `Agent004`) to retrieve the title, body, labels, and state.
2. Use `github-mcp-server-issue_read` (method: `get_comments`) — discussion often contains critical context, root cause analysis, or scope refinements.

**If a spec reference is provided:**
1. Read the feature's `spec.md` for requirements and acceptance criteria.
2. Read the feature's `plan.md` for architecture and implementation context.
3. Read the feature's `tasks.md` for the current task breakdown and status.

**Always, regardless of source:**
1. Read `.specify/memory/constitution.md` to verify the work respects constitutional principles.
2. Read the relevant feature spec under `specs/` if one exists for the area being changed.

### Step 3: Create a comprehensive plan

Before writing any tests, produce a plan document saved to `docs/tdd-plans/` (e.g., `docs/tdd-plans/Issue-42-TDD-Plan.md` or `docs/tdd-plans/session-token-cap-TDD-Plan.md`). **Always save to `docs/tdd-plans/`** — never use the session workspace for plans, since the user cannot see files there. The plan must include:
- **Problem statement:** What's broken or missing, derived from the context source
- **Root cause analysis:** Which code paths are involved and why the current behavior is wrong
- **Proposed tests:** What tests to write, what each one asserts, and why each should fail (red) against current code
- **Proposed fix:** High-level description of the code change that will make the tests pass (green)
- **Affected files:** List of files that will be read, tested, or modified
- **Constitutional check:** Note any relevant principles (e.g., P2 budget cap, P10 test coverage)

### Step 4: Summarize and present the plan

- **Tell the user where the plan is saved** (e.g., "📄 Plan saved to `docs/tdd-plans/Issue-42-TDD-Plan.md`")
- Distill the plan into a concise summary
- Highlight any assumptions or open questions
- Ask for confirmation or corrections before proceeding

## Phase 1: Root Cause Analysis

Before writing any test, invest time understanding the problem deeply. Shallow analysis leads to tests that either pass unexpectedly or don't target the real issue.

### For Bug Fixes

1. **Use the context source as your guide.** Extract from the bug's issue, spec, or description:
   - Repro steps or conditions
   - Expected vs actual behavior
   - Any comments or analysis from team members

2. **Trace the code path.** Follow the execution from the entry point (API endpoint, UI action, event handler) through all layers:
   - What function is called?
   - What does it check/query/modify?
   - Where does the behavior diverge from the expected outcome?

3. **Identify the root cause.** Distinguish between:
   - The **symptom** (what the user sees)
   - The **proximate cause** (the code that misbehaves)
   - The **root cause** (the design flaw or missing logic that enables the misbehavior)

4. **Consider multiple layers.** A bug may involve interactions between:
   - API contracts or data validation
   - Agent logic / tool orchestration / prompt construction
   - State management (Zustand stores, WebSocket handlers)
   - Frontend rendering and user interaction flows

5. **Document your analysis** before writing tests. Know exactly what the test needs to exercise.

### For New Features

1. **Use the context source as your specification.** Extract acceptance criteria, description, and comments to understand what behavior is expected and what edge cases matter.
2. **Identify the right test boundary.** Unit test? Integration test? E2E test?
3. **Map the feature to code locations.** Which files/classes need to change?

## Phase 2: Write Tests (RED)

### Choosing the Right Test Level

| Test Level | When to Use | Speed | Confidence |
|-----------|-------------|-------|------------|
| **Unit test** | Testing a single method/class in isolation | Fast | Focused |
| **Integration test** | Testing service interactions with database/dependencies | Medium | Broad |
| **E2E test** | Testing user-visible behavior through the full stack | Slow | Highest |

**Prefer the lowest level that proves the behavior.** Unit tests for logic bugs, integration tests for data/service interactions, E2E for user-facing flows.

### TypeScript / Vitest Tests (Frontend & Agent)

Follow existing test patterns in the project:

- **Frontend test location:** `packages/frontend/tests/`
- **Agent test location:** `packages/agent/tests/`
- **Test framework:** Vitest with React Testing Library (frontend), Vitest (agent)
- **Naming convention:** Use descriptive `describe`/`it` blocks:
  ```typescript
  describe('parseResponse', () => {
    it('should return empty array when input is null', () => { ... });
    it('should strip HTML tags from personality text', () => { ... });
  });
  ```
- **Run all tests from root:**
  ```bash
  npm test
  ```
- **Run by package:**
  ```bash
  cd packages/frontend && npm test    # Vitest + RTL
  cd packages/agent && npm test       # Vitest
  ```
- **Run a specific test:**
  ```bash
  cd packages/frontend && npx vitest run --reporter verbose -t "test name pattern"
  cd packages/agent && npx vitest run --reporter verbose -t "test name pattern"
  ```

### CDK / Jest Tests (Infrastructure)

- **Test location:** `packages/infra/test/`
- **Test framework:** Jest with CDK assertions
- **Naming convention:** Use descriptive `describe`/`test` blocks
- **Run tests:**
  ```bash
  cd packages/infra && npm test
  ```
- **Run a specific test:**
  ```bash
  cd packages/infra && npx jest --verbose -t "test name pattern"
  ```

### E2E / Playwright Tests

- **Test location:** `tests/e2e/`
- **Test framework:** Playwright
- **Run tests (requires deployed stack):**
  ```bash
  cd packages/frontend && npm run test:e2e
  ```

### Writing Effective Red Tests

**DO:**
- Assert the desired outcome (what SHOULD happen after the fix)
- Use descriptive test names that explain the scenario
- Set up realistic preconditions that mirror the actual bug conditions
- Keep tests focused — one assertion per behavior

**DON'T:**
- Assert the current (broken) behavior — that's a regression test, not TDD
- Write tests that depend on implementation details (test behavior, not structure)
- Write overly broad tests that could pass for the wrong reasons
- Skip running the test to confirm it fails

### When a Test Unexpectedly Passes

This is a critical signal. Investigate:

1. **Verify the assertion.** Is the test actually checking what you think it is?
2. **Check for upstream guards.** Another layer (validation, filtering, authorization) may already prevent the scenario.
3. **Trace the execution.** Step through the code mentally or with a debugger to understand why it passes.
4. **Decide:**
   - If the scenario is already handled → remove the test and document why
   - If the test is wrong → rewrite to target the actual gap
   - If the bug is in a different layer than expected → write the test at the correct layer

## Phase 3: Implement the Fix (GREEN)

1. **Read the failure message** from Step 1. It tells you exactly what needs to change.
2. **Make the minimal change** to the production code.
3. **Run the new test** — confirm it passes.
4. **Run all related tests** — confirm no regressions.
5. **If tests still fail**, iterate:
   - Read the new failure message
   - Adjust the implementation
   - Rerun — repeat until green

## Phase 4: Refactor and Verify

1. **Review the code** — naming, clarity, duplication, comments.
2. **Run the full related test suite** one final time.

## Phase 5: Broader Validation

After the focused TDD cycle, validate more broadly:

1. **Run the full test suite** from the workspace root:
   ```bash
   npm test
   ```
2. **Type-check the project** to catch compile errors across all packages:
   ```bash
   npm run typecheck
   ```
3. **Lint the project** to catch style and quality issues:
   ```bash
   npm run lint
   ```
4. **Build all packages** to verify everything compiles cleanly:
   ```bash
   npm run build
   ```

## Common Pitfalls

| Pitfall | Mitigation |
|---------|------------|
| Writing tests that assert current (broken) behavior | Tests must assert **desired** behavior so they fail (red) |
| Not running the test before implementing | Always confirm the test fails first — a passing test proves nothing |
| Test passes unexpectedly and you skip investigating | Stop and trace why. Another layer may already handle the scenario |
| Writing too many tests before implementing | Write 1-2 focused tests, get them green, then add more if needed |
| Fixing the code before writing the test | The test must exist first — it's the specification, not an afterthought |
| Over-testing implementation details | Test behavior (inputs → outputs), not internal method calls |
| Not running the full related test suite | A fix that passes one test but breaks five others isn't a fix |
| Skipping root cause analysis | Shallow understanding → wrong tests → wasted cycles |
