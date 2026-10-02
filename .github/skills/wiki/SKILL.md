---
name: wiki
description: 'Work with the project wiki — the current-state knowledge base at https://github.com/quattro004/Agent004/wiki. Invoke this skill to ingest a new source (spec, doc, issue, merged PR, AWS documentation), to answer a question from the wiki with citations, to record a trap, or to publish a durable fact you just learned. Also invoke it at session start to pull the wiki and read the Index. The wiki is a separate git repo cloned to a gitignored ./wiki directory whose default branch is master, and pushes are live and public, so they require approval.'
---

# Working With the Wiki

The wiki is this project's **compounding knowledge base** and the current-state
source of truth for completed work. It is a separate git repository cloned to a
gitignored `./wiki` directory.

**The schema — page naming, metadata, precedence, content rules — lives on the
wiki's `Wiki-Conventions` page. Read it; this skill does not restate it.** That
separation is deliberate: two copies of the rules would drift, and the wiki's
copy is the one human contributors editing in the browser will see.

## Before anything else

```sh
pnpm run wiki:pull
```

Then read `wiki/Index.md`. It lists every page. Check `wiki/Gotchas.md` before
rediscovering a known trap.

If `./wiki` does not exist, `wiki:pull` clones it. An **empty** wiki cannot be
cloned at all — the first page must be created in the browser.

## The four workflows

### 1. Ingest — a new source arrived

Use when you have read something the wiki does not yet know: a spec, a design
doc, a GitHub issue, a merged PR, or external material such as AWS or SDK
documentation.

External sources count. Research that only ever reaches a PR description has
evaporated. If it will be consulted again, it earns a `Source-*` page.

Run every step, in order. Steps 4 and 5 are the ones that get skipped:

1. Read the source properly — not just its title.
2. Write or refresh its `Source-*` page.
3. Update **every** affected `Concept-`, `Component-`, `Contract-`, `Decision-`
   and `Feature-` page. Grep the wiki for the topic; do not guess at the set.
4. **Add any new page to `Index.md`.** The linter fails on unindexed pages and
   on orphans, so the page also needs at least one inbound `[[wikilink]]` from a
   page body — `related:` in the metadata block does **not** count.
5. **Append a row to `Log.md`.** Newest last. Record *why*, not just *what*.
   Never leave a blank line between table rows — GitHub ends the table there
   and everything below renders as literal pipe-prefixed prose. The `table`
   lint rule catches this, and a row with no closing `|`.
6. Run `pnpm run wiki:lint` and fix every finding.
7. Ask for approval, then `pnpm run wiki:push`.

### 2. Query — answer a question from the wiki

1. Read `Index.md` first, then drill into the specific pages.
2. Answer **with citations** — name the page you got it from.
3. If the answer is durable and the wiki did not already hold it, **file it back
   as a new page or a page edit.** This is what makes exploration compound
   instead of evaporating into chat history.

### 3. Record a trap

The standing rule: when you hit a non-obvious trap, write it on the page that
owns it **and** add a pointer line to `Gotchas.md`, in the same change. Both
halves, always — `Gotchas` is an index, so the full story belongs in context on
the owning page.

### 4. Memory or wiki?

Memories are tribal knowledge, and the wiki is opt-in. Storing a memory does not
by itself mean publishing anything. A **user** memory follows one builder; a
**repository** memory is shared with every contributor whose agent has Copilot
Memory enabled. Neither reaches a human reader.

| If the fact is… | It goes… |
| --- | --- |
| Builder-specific (workflow, tools, preferences) | User memory only |
| Tribal knowledge (tool quirks, verified commands, agent traps) | Repository memory only |
| Project truth (architecture, decisions, current behavior) or a trap humans hit too | The wiki: owning page, plus `Gotchas` for a trap |

The test for the wiki: *would a human reader, or a contributor without Copilot
Memory, lose an hour without this?* See `AGENTS.md` § Keep this file current.

## Validating

```sh
pnpm run wiki:lint
```

The linter lives in `packages/repo-tools`, so it is itself linted, typechecked
and tested. It is deliberately **not** part of `pnpm run validate` — the `wiki/`
clone is optional and gitignored, so `validate` must pass without it. Run both
when a change spans the wiki and the main repo.

Browser edits on github.com bypass the linter entirely.

## Pushing — live, public, and gated on approval

```sh
pnpm run wiki:push                             # uses the default "Update wiki" message
pnpm run wiki:push -- "Record the CRLF trap"   # or supply your own
pnpm run wiki:push -- -m "Record the CRLF trap"
```

**Quote the whole message.** Anything the argument parser cannot explain — an
unknown flag, a message split across several unquoted words, an empty one — is
rejected with a usage error and a non-zero exit *before* git runs. A wiki push
is live, public and un-reviewed, so a misunderstood argument has to fail loudly
rather than be guessed at: `--message "text"` once committed the literal string
`--message` as the wiki commit message, because the bin read `argv[2]`
positionally.

It stages and commits **only when the working tree is dirty**, then pushes
whether or not this run committed anything — so committing by hand first with a
real message works, and is usually better. A clean, up-to-date clone reports
"nothing to push" and exits 0.

**Always ask the user before pushing.** A GitHub wiki has no branches, no pull
requests, no review and no CI: the push *is* the publication, to everyone,
immediately.

Two consequences worth stating out loud when a change spans both repos:

- The wiki half goes public **before** the accompanying main-repo PR merges. If
  that PR is later reworked or rejected, the wiki must be reverted separately
  via its own git history (`cd wiki && git revert <sha> && git push origin master`).
- The wiki's default branch is **`master`**, not `main`. Never assume otherwise
  in a script.

## Writing a page — the short version

Full rules on `Wiki-Conventions`. The ones most often got wrong:

- Open with the `<!--meta ... -->` HTML-comment block. **Not YAML frontmatter** —
  the wiki renders frontmatter as visible junk rather than stripping it.
- Set `verified:` to the date you actually checked the claims against the code,
  not the date you edited the page. A page asserting "implemented" carries the
  same hazard as a `[x]` in `tasks.md`: it is a claim, not proof.
- Filenames use an allowed prefix and are **globally unique** — the namespace is
  flat and folders do not nest in the UI.
- Keep pages at or under 300 lines; split longer ones.
- Cite a source that has left the tree by pinned permalink, `path@sha`.

## Hard content rules — this wiki is world-readable

- The project name is **Max Height**. Never write "Max Headroom" in
  project-visible copy (P4).
- Never write a credential, access key, AWS account ID, or an ARN containing
  one (P11). The linter checks for credential-shaped strings, but it is a
  backstop, not a substitute for care.

## Wiki or Spec Kit?

Use the **wiki** (a `Feature-*` page plus GitHub issues, no branch) for changes
to existing behavior, bug fixes, refactors, tooling, dependency and CI work, and
knowledge capture.

Use **Spec Kit** (`specs/NNN-*`, feature branch, full pipeline) for a new
user-facing capability, a new AWS resource or cost-model change, work needing a
constitution check, or work needing research first.

When iterating on artifacts Spec Kit already generated, read the wiki's
`Guide-Spec-Kit-Iteration` first — `speckit.plan` and `speckit.tasks` regenerate
destructively.
