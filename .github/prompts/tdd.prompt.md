---
description: 'Fix a bug or add a feature using Test-Driven Development (Red-Green-Refactor)'
agent: 'agent'
---

# Test-Driven Development

**What do you want to build or fix?** ${input:task:Describe the bug to fix, feature to add, or behavior to change.}

**Context reference (optional):** ${input:contextRef:GitHub issue number (e.g. 42), spec path (e.g. specs/001-max-height-ai-character), or leave blank to work from your description above.}

Before implementing, gather context from the provided reference (issue, spec, or description), read the relevant spec and constitution, create a comprehensive plan, and present it for review. Then write failing tests that describe the behavior we wish we had, and write the code to make them pass.

Follow the `tdd` skill to execute the Red-Green-Refactor cycle.
