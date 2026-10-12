# Contract: Runtime and build configuration

Every value a deployment needs is listed here with its source. A value marked **derived** is computed from a cited number at deploy time. None is chosen freely.

## Rules

- **CDK is the only writer.** Each value is set in a stack and asserted in that stack's test (A1, CDK-only).
- **Fail loud.** Every consumer reads its configuration once at startup. A missing or unparseable value throws at initialization, so the runtime fails its readiness check and the Lambda errors. Neither silently no-ops (the #61 lesson; AGENTS.md "Do not hide failures").
- **No secrets in environment variables.** `CfnRuntime.environmentVariables` and Lambda `environment` values are plaintext in the synthesized template. Secrets stay in SSM SecureString and are read at startup by name.
- **Limits**: a runtime has at most 50 environment variables, each at most 2,048 characters (W24, AgentCore Runtime documentation).
- **Never commit** the budget email address, the Google client secret, or any tool API key. The email is passed with `-c budgetAlertEmail=…` (AGENTS.md).

## Agent runtime (`CfnRuntime.environmentVariables`)

| Variable | Value | Source |
| --- | --- | --- |
| `AWS_REGION` | `us-west-2`. If the platform already sets it, the startup check asserts the value instead of setting it. | FR-031; `bin/app.ts` pins it |
| `MODEL_ID` | The model adopted under Q2: an in-Region ID, `anthropic.claude-haiku-5-5` or `amazon.nova-lite-v1:0` as S0 decides ([s0-probe-matrix.md](./s0-probe-matrix.md)) | Research Q0 and Q2; S0 |
| `MAX_OUTPUT_TOKENS` | `250` | `index.ts:97` (kept, Q2) |
| `CONTROL_TABLE_NAME` | Table name from the Data stack | [data-model.md](../data-model.md) |
| `MEMORY_ID` | `CfnMemory` ID from the Data stack | [memory-api.md](./memory-api.md) |
| `MEMORY_TOP_K` | `10` | `memory/memoryAdapter.ts` (existing) |
| `POLLY_VOICE_ID` | `Matthew` | Spec 001 `contracts/polly-tts.md:23` |
| `POLLY_ENGINE` | `neural` | Spec 001 `contracts/polly-tts.md:24` |
| `POLLY_SAMPLE_RATE` | `24000` | Spec 001 `contracts/polly-tts.md:27` |
| `SESSION_MAX_TURNS` | `50` | Spec 001 FR-010 |
| `SESSION_MAX_TOKENS` | `20000` (conversational, P-09) | Spec 001 FR-010 |
| `SESSION_MAX_MINUTES` | `30` | Spec 001 FR-010 |
| `RATE_LIMIT_PER_HOUR` | `60` | Spec 001 `contracts/websocket-api.md:207` |
| `RATE_LIMIT_PER_DAY` | `500` | Spec 001 `contracts/websocket-api.md:208` |
| `MESSAGE_MAX_CHARS` | `2000` | P-08; spec 001 `contracts/websocket-api.md:209` |
| `HISTORY_WINDOW` | `40` | Strands `SlidingWindowConversationManager` default (`agent.d.ts:113`) |
| `BREAKER_DEGRADE_MICRO_USD` | **Derived**: (8 − F) × 10⁶ | Research Q6; F from R-cost |
| `BREAKER_TRIP_MICRO_USD` | **Derived**: (10 − F) × 10⁶ | Research Q6; F from R-cost |
| `PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD` | **Derived** from the adopted model's human-read price | R-cost |
| `PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD` | Same | R-cost |
| `PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD` | Same; `0` while caching is off (S2) | R-cost; #49 |
| `PRICE_POLLY_PER_MCHAR_MICRO_USD` | **Derived** from the human-read Polly Neural price; spec 001 R0 had $16 per 1M | R-cost |
| `PRICE_MEMORY_EVENT_MICRO_USD` | **Derived**: $1.00 per GB × the event's billed size (12 KB minimum, 64 KB maximum) | R-cost (verified 2026-10-11) |
| `PRICE_MEMORY_RETRIEVAL_MICRO_USD` | **Derived**: $0.50 per 1,000 → 500 | R-cost (verified) |
| `PRICE_RUNTIME_PER_TURN_MICRO_USD` | **Derived**: R-cost's per-session Runtime V2 estimate ÷ spec 001's turns per session | R-cost |
| `SSM_PARAM_WEATHER_KEY` | `/max-height/weather-api-key` | `agent-stack.ts` (existing parameter) |
| `SSM_PARAM_NEWS_KEY` | `/max-height/news-api-key` | Same |
| `SSM_PARAM_SEARCH_KEY`, `SSM_PARAM_SEARCH_ENGINE_ID` | New SecureString names under `/max-height/` | `webSearchTool.ts:30,35` read them from the environment today |

That is 29 variables, under the limit of 50.

When the Memory extraction cost is resolved (R-cost, currently **unverified**), and if it is billed per event, a `PRICE_MEMORY_EXTRACTION_*` variable is added and counted by the breaker.

The breaker's estimate is a **floor**, not the bill: lines that are not per-turn, such as logs, spans and ECR, sit in F. That is why the limits are set below P2's dollar thresholds by F, rather than at them.

### Secrets loaded at startup

`initialize()` reads each `SSM_PARAM_*` with `GetParameter` (`WithDecryption: true`) and passes the values to the tool factories. It does not write them back into `process.env`. A missing parameter **fails initialization**. The tools that read `process.env.*_API_KEY` today (`weatherTool.ts:24`, `newsTool.ts:29`, `webSearchTool.ts:30,35`) take their keys as arguments instead.

### Runtime resource settings

| Setting | Value | Source |
| --- | --- | --- |
| `platformVersion` | Runtime V2, typed property, pinned by a test | P-04; W17 refuted for 2.272.0 |
| Container | ARM64, port 8080, `/ping` and `/invocations` | W24 |
| Inbound auth | JWT: `discoveryUrl` = the user pool's OpenID configuration URL; `allowedClients` = [app client ID] | Research Q4; [auth-and-allowlist.md](./auth-and-allowlist.md) |
| Request header allowlist | `Authorization` | Research Q4 |
| Idle runtime session timeout | `1800` s | W25 (the default is 900 s) |
| Maximum lifetime | `28800` s (8 hours) | W25 |
| Network mode | Public | No VPC: a NAT gateway is a fixed cost (FR-052) |

### Execution role, least privilege (P11)

| Action | Resource |
| --- | --- |
| `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` | The adopted model's foundation-model ARN in `us-west-2` only. No inference-profile ARN (Q0). |
| `bedrock:ListAsyncInvokes` | `*`, unless the service authorization reference offers a resource type (checked at task time). The warm-up probe calls it, and its error stops initialization, so without this grant `/ping` never reports healthy (`bedrock/warmup.ts`; `index.ts:282-312`; W26). It runs no model and bills nothing. |
| `polly:SynthesizeSpeech` | `*`, with conditions `polly:Engine = neural` and `polly:VoiceId = Matthew` (spec 001 `contracts/polly-tts.md:202-210`) |
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

`VITE_WS_URL` is removed with the WebSocket path (`App.tsx:33`, `config/wsUrl.ts`). A production build with any of these values missing fails the build, so it does not ship a broken client. This matches the fail-closed precedent in `config/wsUrl.ts`.

## Lambdas

| Function | Variables |
| --- | --- |
| `pre-sign-up` | `CONTROL_TABLE_NAME` |
| `pre-token-generation` | `CONTROL_TABLE_NAME` |
| `hard-stop` | `CONTROL_TABLE_NAME`, `RUNTIME_ROLE_NAME`, `DENY_POLICY_NAME` |
| `memory-pruner` | `CONTROL_TABLE_NAME`, `MEMORY_ID`, `RETENTION_DAYS=30` (constitution `:236`) |
| `idp-secret` (custom resource) | `SSM_PARAM_GOOGLE_CLIENT_SECRET`, `USER_POOL_ID`, `PROVIDER_NAME=Google` |
