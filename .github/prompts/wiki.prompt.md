---
description: 'Work with the project wiki — ingest a source, answer a question with citations, record a trap, or publish a durable fact'
agent: 'agent'
---

# Wiki

**What do you want to do?** ${input:task:e.g. "ingest the AgentCore V2 docs", "what does the wiki say about the budget ceiling?", "record the CRLF trap", or leave blank to pull and summarize what changed.}

**Source (optional):** ${input:source:A repo path, a GitHub issue or PR number, or a URL to ingest. Leave blank for a query or a trap.}

Start with `pnpm run wiki:pull` and read `wiki/Index.md`. Then follow the `wiki` skill for the matching workflow — ingest, query, record a trap, or decide between memory and wiki.

Remember: update `Index.md` and append to `Log.md` in the same change, run `pnpm run wiki:lint` before finishing, and **ask for approval before `pnpm run wiki:push`** — wiki pushes are live and public.
