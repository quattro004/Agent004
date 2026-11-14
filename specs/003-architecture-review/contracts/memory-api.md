# Contract: Memory (AgentCore Memory)

Long-term memory ships in the first deployment (builder, 2026-10-11; P-03). Decision: research Q8. Entities: [data-model.md](../data-model.md) § Memory. Requirements: FR-012, FR-013, spec 001 FR-017 (forget me) and FR-018 (export), spec 001 User Story 4 and SC-007.

## Resource (`data-stack.ts`)

| Property | Value | Source |
| --- | --- | --- |
| Construct | `CfnMemory` (L1, `aws-cdk-lib` 2.272.0) | `bedrockagentcore.generated.d.ts:6640` |
| `eventExpiryDuration` | `7` (days, the service minimum) | `generated.d.ts:6274` |
| Strategies | Built-in **semantic**, **summary** and **user preference** | Spec 001 `data-model.md:73-89` |
| Strategy namespaces | Semantic: `/max-height/{actorId}/facts/`. User preference: `/max-height/{actorId}/preferences/`. Summary: `/max-height/{actorId}/summaries/{sessionId}/` | The existing prefix (`memory/memoryAdapter.ts:57-59`), with one sub-path per strategy |
| Encryption | Service default (no customer-managed KMS key) | A customer-managed key is a fixed monthly cost (FR-052) |
| Callers | The runtime execution role and the pruner role only, each scoped to this memory's ARN | P11 |

`{actorId}` is always the verified `sub` (FR-012). `{sessionId}` is the counted session ID. The runtime session ID never appears in Memory.

## Write path: one event per turn

After a turn's `done` is written ([transport-sse.md](./transport-sse.md)), the runtime calls `CreateEvent`:

```jsonc
{
  "memoryId": "<MEMORY_ID>",
  "actorId": "<sub>",
  "sessionId": "<countedSessionId>",
  "eventTimestamp": "<turn end>",
  "payload": [
    { "conversational": { "role": "USER", "content": { "text": "<friend's message>" } } },
    { "conversational": { "role": "ASSISTANT", "content": { "text": "<Max's reply>" } } },
  ],
}
```

- **One event holds both messages**, so each turn bills once at the 12 KB event minimum (R-cost: about $0.0006 per 50-turn session).
- **A cancelled turn** writes no event: nothing was delivered.
- **A failure is loud, not fatal.** The reply has already been delivered, so the turn stands. The runtime logs a structured warning without message text, increments a metric, and sets `failed` on the `memory.create_event` span. It does not retry inline.
- **Extraction is asynchronous and service-run.** Records appear some time after the event, and that delay is **unverified**. Quickstart's recall scenario waits for records to appear rather than assuming a delay.

## Read path: once per counted session

When a counted session opens, the runtime calls `RetrieveMemoryRecords` with:

- the namespace `/max-height/<sub>/`
- the friend's first message as `searchQuery`
- `topK` = `MEMORY_TOP_K` (10)

The results are added to the system prompt of that session's `Agent`, as a delimited "what you remember about this friend" block. Continuing turns do not retrieve again.

- **Namespace matching**: whether `RetrieveMemoryRecords` treats the namespace as a prefix is **unverified**. If it is exact-match only, the runtime makes one call per strategy namespace, three in all. That is checked against the API reference at task time, and R-cost counts retrievals either way.
- **On failure** (P8): the session continues with no memories, and the failure is loud: a warning log, a metric, and `failed` on the `memory.retrieve` span.

## Friend-facing operations

These go through the same endpoint, `POST …/invocations`, with an `action` field in the body ([transport-sse.md](./transport-sse.md) § Actions).

- **Checks**: every action passes body validation, `CONTROL#HALT` and the allowlist. `memory.list`, `memory.export` and `memory.delete` also count against the message rate limit (60 per hour, 500 per day), which bounds their cost without a new number. `memory.forget` skips the rate limit, so a friend can always erase their data.
- **Not applied**: the counted-session caps and the breaker refusal. Their Memory calls are still added to the breaker tally at `PRICE_MEMORY_RETRIEVAL_MICRO_USD` ([runtime-config.md](./runtime-config.md)).
- **During a hard stop**: HALT blocks sign-in, and the deny-all policy blocks the runtime role ([spend-control.md](./spend-control.md)), so friends cannot reach these actions. The pruner runs under its own role, so the 30-day window still holds. A forget request that arrives by other means follows the builder's delete-on-request runbook ([auth-and-allowlist.md](./auth-and-allowlist.md) § Allowlist operations). The privacy page says so.

| `action` | Behavior | `result` event payload |
| --- | --- | --- |
| `memory.list` | `ListMemoryRecords` over each of the friend's strategy namespaces, all pages | `{ "records": [{ "id", "text", "kind", "createdAt" }] }`, where `kind` is `fact`, `preference` or `summary` |
| `memory.export` (spec 001 FR-018) | Same data as `memory.list`. The browser saves it as a `.json` download (spec 001 clarification, `spec.md:39`). | `{ "exportedAt", "records": [...] }` |
| `memory.delete` (spec 001 V1 per-item delete), with `memoryRecordId` | `GetMemoryRecord`. If **any** of the record's namespaces is outside `/max-height/<sub>/`, answer `error` code `not_found`, exactly as for an ID that does not exist. Otherwise `DeleteMemoryRecord`. | `{ "deleted": 1 }`. Fixes N3: `handleDeleteMemory` has no ownership check today (`memoryHandlers.ts:59-74`). |
| `memory.forget` (spec 001 FR-017) | 1. `ListMemoryRecords` under every strategy namespace, then `BatchDeleteMemoryRecords`. 2. `ListSessions` for `actorId = sub`, then `ListEvents` and `DeleteEvent` for each event. 3. End the counted session and drop the in-process `Agent`, so in-session history goes too. | `{ "recordsDeleted", "eventsDeleted" }` |

`memory.forget` is all-or-error. If any delete fails, the action ends with `error` code `internal` and the friend can retry. Every step is idempotent. The Forget-me control never reports success after a partial wipe.

Ownership is enforced by deriving every namespace and `actorId` from the token's `sub`. The client never supplies a namespace, an `actorId` or a session. The claim that Memory itself enforces access on the JWT `sub` is **not relied on** (research Q8).

## Pruner: the 30-day rolling window (N5)

`handlers/memory-pruner.ts` runs once a day on an EventBridge schedule (cost human-read, R-cost).

1. Scan the control table for `FRIEND#` items where `lastSeenAt` is more than `RETENTION_DAYS` (30) ago and `memoryPrunedAt` is absent or earlier than `lastSeenAt`. The 30 days come from constitution `:236` and spec 001 `data-model.md:165`.
2. For each one, run steps 1 and 2 of `memory.forget` for that `sub`.
3. Set `memoryPrunedAt` on the `FRIEND#` item.

Any failure **throws** after the remaining friends are attempted. The Lambda `Errors` alarm then emails the operations topic ([spend-control.md](./spend-control.md) § Operations alarms). A friend who signed in but never chatted has no `lastSeenAt` and is skipped.

**Single-friend mode.** Invoked by the operator with `{ "sub": "<sub>" }`, the pruner runs step 2 for that one `sub`, regardless of `lastSeenAt`. This is step 1 of the delete-on-request runbook, so an operator wipe uses the same tested code as the daily run.

`FRIEND#<sub>` gains one attribute, `memoryPrunedAt` ([data-model.md](../data-model.md)).

## Superseded code

| File | Disposition |
| --- | --- |
| `memory/memoryExtractor.ts` (regex extraction) | Superseded by built-in strategies. The display-alias helper is kept only if a caller remains (checked at task time). |
| `memory/agentCoreMemoryClient.ts` | Gets a real implementation over `@aws-sdk/client-bedrock-agentcore`. Today it throws (`agentCoreMemoryClient.ts:55-61`). |
| `memory/memoryAdapter.ts` | `retrieveMemories`, `listMemories` and `wipeMemories` are kept and extended to events. `storeMemories` (`BatchCreateMemoryRecords`) is unused once extraction is service-run, and is removed at task time if nothing calls it. |
| `memory/memoryHandlers.ts` | Each handler takes the verified `sub`, never a client `actorId`. `handleDeleteMemory` gains the ownership check above. |
