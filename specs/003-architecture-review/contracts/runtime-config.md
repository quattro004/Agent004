# Contract: Runtime and build configuration

Every value a deployment needs is listed here with its source. A value marked **derived** is computed from a cited number at deploy time. None is chosen freely.

## Rules

**Approved safety follow-up (2026-11-15), applied:** spec.md's Session
2026-11-15 records the turn/input/concurrency bounds, 15-minute session
cleanup grace and $5 monthly non-chat allowance. The turn and input bounds
landed under T163/T164, and the $11/$15 application thresholds landed under
T117 once constitution amendment **A7** was applied (1.8.0 → 1.9.0, T165).
The earlier F-only threshold formulas, (16 − F) and (20 − F), are superseded:
the flat $5 reservation replaced the subtraction. Admission control and
reservation remain T166/T167.

- **CDK is the only writer.** Each value is set in a stack and asserted in that stack's test (A1, CDK-only).
- **Fail loud.** Every consumer reads its configuration once at startup. A missing or unparseable value throws at initialization, so the runtime fails its readiness check and the Lambda errors. Neither silently no-ops (the #61 lesson; AGENTS.md "Do not hide failures").
- **No secrets in environment variables.** `CfnRuntime.environmentVariables` and Lambda `environment` values are plaintext in the synthesized template. Secrets stay in SSM SecureString and are read at startup by name.
- **Limits**: a runtime has at most 50 environment variables, each at most 2,048 characters (W24, AgentCore Runtime documentation).
- **Never commit** the budget email address, the Google client secret, or any tool API key. The email is passed with `-c budgetAlertEmail=…` (AGENTS.md).

## Agent runtime (`CfnRuntime.environmentVariables`)

| Variable | Value | Source |
| --- | --- | --- |
| `AWS_REGION` | `us-west-2`. If the platform already sets it, the startup check asserts the value instead of setting it. | FR-031; `bin/app.ts` pins it |
| `MODEL_ID` | The route adopted under Q2: `global.anthropic.claude-haiku-4-5-20251001-v1:0`, the Haiku 4.5 global inference profile (T144). The post-upgrade review (T152) may change it | Research Q0 and Q2; S0; T102 |
| `MAX_OUTPUT_TOKENS` | `250` | `index.ts:97` (kept, Q2) |
| `CONTROL_TABLE_NAME` | Table name from the Data stack | [data-model.md](../data-model.md) |
| `MEMORY_ID` | `CfnMemory` ID from the Data stack | [memory-api.md](./memory-api.md) |
| `MEMORY_TOP_K` | `10` | `memory/memoryAdapter.ts` (existing) |
| `POLLY_VOICE_ID` | `Matthew` | Spec 001 `contracts/polly-tts.md:23` |
| `POLLY_ENGINE` | `standard` | Amendment A6 (2026-11-13; spec 001 `contracts/polly-tts.md:24` had `neural`) |
| `POLLY_SAMPLE_RATE` | `24000` | Spec 001 `contracts/polly-tts.md:27` |
| `SESSION_MAX_TURNS` | `50` | Spec 001 FR-010 |
| `SESSION_MAX_TOKENS` | `20000` (conversational, P-09) | Spec 001 FR-010 |
| `SESSION_MAX_MINUTES` | `30` | Spec 001 FR-010 |
| `RATE_LIMIT_PER_HOUR` | `60` | Spec 001 `contracts/websocket-api.md:207` |
| `RATE_LIMIT_PER_DAY` | `500` | Spec 001 `contracts/websocket-api.md:208` |
| `MESSAGE_MAX_CHARS` | `2000` | P-08; spec 001 `contracts/websocket-api.md:209` |
| `HISTORY_WINDOW` | `40` | Strands `SlidingWindowConversationManager` default (`agent.d.ts:113`) |
| `REQUEST_BODY_MAX_BYTES` | `16384` (16 KiB, UTF-8). Refused **while reading**, before the body is parsed | Spec Session 2026-11-15; T163 |
| `MODEL_INPUT_MAX_BYTES` | `32768` (32 KiB serialized). Oldest messages are dropped first; the current request never is | Same |
| `TOOL_RESULT_MAX_BYTES` | `8192` (8 KiB per serialized tool result). Truncated results are marked so the model does not treat them as complete | Same |
| `TURN_MAX_MODEL_CALLS` | `4` → SDK `InvokeLimits.turns` | Same |
| `TURN_MAX_TOOL_EXECUTIONS` | `4`. The SDK has no tool-count limit; enforced with a `BeforeToolCallEvent` hook | Same |
| `TURN_MAX_GENERATED_TOKENS` | `1000` → SDK `InvokeLimits.outputTokens`, lowered further by the session's remaining budget | Same |
| `TURN_MAX_BILLED_TOKENS` | `64000` (input + output) → SDK `InvokeLimits.totalTokens`. Checked **between** calls, so the stopping call can overshoot | Same; `InvokeLimits` in the pinned SDK's `.d.ts` |
| `TURN_DEADLINE_MS` | `60000`. Covers model, tool and voice work together. Reaching it is not success; billed work is still counted | Same |
| `GLOBAL_MAX_ACTIVE_REQUESTS` | `2`. Spend-bearing requests in flight across every runtime instance; the per-friend limit of one is the `LEASE#<sub>` key, not a variable. At least `1`. Enforced atomically at admission (T166) | Spec Session 2026-11-15; `spend-control.md` § Admission |
| `BREAKER_DEGRADE_MICRO_USD` | `11000000`. Constitution 1.9.0 P2's application layer (amendment A7): soft-degrade at $11 of measured application spend | Research Q6; constitution P2 |
| `BREAKER_TRIP_MICRO_USD` | `15000000`. Same layer: refuse new spend-bearing work at $15 | Research Q6; constitution P2 |
| `PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD` | **Derived** from the adopted model's human-read price | R-cost |
| `PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD` | Same | R-cost |
| `PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD` | Same; `0` while caching is off (S2) | R-cost; #49 |
| `PRICE_POLLY_PER_MCHAR_MICRO_USD` | **Derived** from the Polly Standard price, $4 per 1M → 4,000,000 (amendment A6, 2026-11-13; spec 001 R0 had Neural's $16) | R-cost |
| `PRICE_MEMORY_EVENT_MICRO_USD` | `13`. **Derived**: $1.00 per GB at the 12 KiB billing minimum (11.44 µUSD read as GiB, 12.29 µUSD read as a decimal GB; the larger is rounded up so the tally cannot undercount). `MESSAGE_MAX_CHARS` and `MAX_OUTPUT_TOKENS` keep every event under the minimum, so the 64 KB maximum is unreachable | R-cost (verified 2026-10-11) |
| `PRICE_MEMORY_RETRIEVAL_MICRO_USD` | **Derived**: $0.50 per 1,000 → 500 | R-cost (verified) |
| `PRICE_RUNTIME_PER_TURN_MICRO_USD` | `831`. **Derived**: R-cost's § F Runtime V2 lines, CPU $0.06 plus memory $0.60, over the average case's 795 turns = $0.00083019. The average case is the dearer per turn; the full case spreads $0.33 across 800 | R-cost § F |
| `SSM_PARAM_WEATHER_KEY` | `/max-height/weather-api-key` | `agent-stack.ts` (existing parameter) |
| `SSM_PARAM_NEWS_KEY` | `/max-height/news-api-key` | Same |
| `SSM_PARAM_SEARCH_KEY`, `SSM_PARAM_SEARCH_ENGINE_ID` | `/max-height/search-api-key` and `/max-height/search-engine-id` (new SecureStrings, tasks.md C15) | `webSearchTool.ts:30,35` read them from the environment today |

That is 38 variables, under the limit of 50.

No `PRICE_MEMORY_EXTRACTION_*` variable is needed. Built-in strategies include extraction in the long-term storage price (R-cost, resolved 2026-11-13 under T005a).

The breaker's estimate is a **floor**, not the bill: lines that are not per-turn, such as logs, spans and ECR, sit in F. Constitution 1.9.0 P2 answers that with a flat $5 reservation rather than the earlier subtraction of a measured F, so the limits are $11 and $15 against P2's $16 and $20 gross figures. The $5 covers F **and** pricing uncertainty, and P2 states plainly that this does not guarantee an invoice under $20.

### Secrets loaded at startup

`initialize()` reads each `SSM_PARAM_*` with `GetParameter` (`WithDecryption: true`) and passes the values to the tool factories. It does not write them back into `process.env`. A missing parameter **fails initialization**. The tools that read `process.env.*_API_KEY` today (`weatherTool.ts:24`, `newsTool.ts:29`, `webSearchTool.ts:30,35`) take their keys as arguments instead.

### Runtime resource settings

| Setting | Value | Source |
| --- | --- | --- |
| `platformVersion` | Runtime V2, typed property, pinned by a test | P-04; W17 refuted for 2.272.0 |
| Container | ARM64, port 8080, `/ping` and `/invocations` | W24 |
| Inbound auth | JWT: `discoveryUrl` = the user pool's OpenID configuration URL; `allowedClients` = [app client ID] | Research Q4; [auth-and-allowlist.md](./auth-and-allowlist.md) |
| Request header allowlist | `Authorization`. AgentCore refuses every other `x-amzn-` header except the `...-Runtime-Custom-` prefix, so the session ID header is not listed (tasks.md C15) | Research Q4; [runtime-header-allowlist](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-header-allowlist.html) |
| Idle runtime session timeout | `1800` s | W25 (the default is 900 s) |
| Maximum lifetime | `28800` s (8 hours) | W25 |
| Network mode | Public | No VPC: a NAT gateway is a fixed cost (FR-052) |

### Execution role, least privilege (P11)

| Action | Resource |
| --- | --- |
| `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` | AWS's documented pattern for a global inference profile, in three statements (research § Q2, "IAM for T140"; T140): the profile ARN in `us-west-2` with `aws:RequestedRegion = us-west-2`; the `us-west-2` foundation-model ARN with that Region and `bedrock:InferenceProfileArn` = the profile; and the Region-less `arn:aws:bedrock:::foundation-model/...` ARN with `aws:RequestedRegion = unspecified` and the same profile condition. **P11 exception**: the global route cannot be limited to `us-west-2`; the profile condition is the scoping that remains. |
| `bedrock:ListAsyncInvokes` | `*`, unless the service authorization reference offers a resource type (checked at task time). The warm-up probe calls it, and its error stops initialization, so without this grant `/ping` never reports healthy (`bedrock/warmup.ts`; `index.ts:282-312`; W26). It runs no model and bills nothing. |
| `polly:SynthesizeSpeech` | `*`, with `aws:RequestedRegion = us-west-2`. Neural and Matthew are application settings: AWS documents no `polly:Engine` or `polly:VoiceId` IAM keys ([service authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_polly.html), checked 2026-11-07). This corrects spec 001's frozen `contracts/polly-tts.md:202-210` example. |
| `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` | The control table ARN |
| `bedrock-agentcore:CreateEvent`, `ListSessions`, `ListEvents`, `DeleteEvent`, `RetrieveMemoryRecords`, `ListMemoryRecords`, `GetMemoryRecord`, `DeleteMemoryRecord`, `BatchDeleteMemoryRecords` | The one memory ARN ([memory-api.md](./memory-api.md)). Action names are checked against the service authorization reference at task time. The pruner role gets only the list and delete actions. |
| `ssm:GetParameter` | The `SSM_PARAM_*` parameter ARNs only |
| `kms:Decrypt` | The AWS-managed `aws/ssm` key, with the condition `kms:ViaService = ssm.us-west-2.amazonaws.com` |
| Logs, X-Ray and ECR pull | As the AgentCore Runtime documentation requires |

The hard stop attaches a deny-all-spend inline policy to this role ([spend-control.md](./spend-control.md) § Deny-all-spend policy). DynamoDB, Logs and X-Ray stay allowed so the container can still refuse with `halted`. The role name and that policy name are passed to the hard-stop Lambda by CDK. Neither is written as a literal.

## Frontend build (`VITE_*`, written by the deploy step from stack outputs)

| Variable | Value |
| --- | --- |
| `VITE_RUNTIME_ARN` | The `CfnRuntime` ARN. The client URL-encodes it into `/runtimes/{arn}/invocations`. |
| `VITE_COGNITO_DOMAIN` | `https://<prefix>.auth.us-west-2.amazoncognito.com` |
| `VITE_COGNITO_CLIENT_ID` | The app client ID (public client, no secret) |
| `VITE_REDIRECT_URI` | `https://max.recipieces.com/auth/callback` |
| `VITE_SIGN_OUT_URI` | `https://max.recipieces.com/` |

`VITE_WS_URL` is removed with the WebSocket path (`App.tsx:33`, `config/wsUrl.ts`). A deploy build with any of these values missing fails the build, so it does not ship a broken client. This matches the fail-closed precedent in `config/wsUrl.ts`.

A **deploy build** is a production build that either sets `MAX_HEIGHT_DEPLOY=1` or carries some of these values but not all of them. A production build carrying none of them is CI compiling the client, which deploys nothing, so it is left alone — otherwise `pnpm run build` could never pass without deployment configuration no contributor holds. Tasks deviation C27. Every build writes `max-height-build.json` into `dist` recording whether it was a deploy build; `FrontendStack` publishes only when that says `true` and `-c publishSite=true` is set, so a compile-check `dist` can never reach the bucket (tasks deviation C42).

## Lambdas

| Function | Variables |
| --- | --- |
| `pre-sign-up` | `CONTROL_TABLE_NAME` |
| `pre-token-generation` | `CONTROL_TABLE_NAME` |
| `hard-stop` | `CONTROL_TABLE_NAME`, `RUNTIME_ROLE_NAME`, `DENY_POLICY_NAME` |
| `memory-pruner` | `CONTROL_TABLE_NAME`, `MEMORY_ID`, `RETENTION_DAYS=30` (constitution `:236`) |
| `idp-secret` (custom resource) | `SSM_PARAM_GOOGLE_CLIENT_SECRET`, `USER_POOL_ID`, `PROVIDER_NAME=Google` |
