// Spike S0 probe runner. See ../contracts/s0-probe-matrix.md for the rules and the expected results.
// Run by the builder, with temporary credentials (P11), in the Free-plan account that will host the deployment:
//   node specs/003-architecture-review/scripts/s0-probe.ts --dry-run   # prints the plan, calls nothing
//   node specs/003-architecture-review/scripts/s0-probe.ts             # runs all seven probes
// Node strips the types natively, so the file uses erasable syntax only. Needs `pnpm install` first. It resolves
// the AWS SDK clients already pinned by packages/agent (Bedrock) and packages/frontend (Polly), so it adds no
// dependency.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGION = 'us-west-2';
const PROMPT = 'Reply with the single word OK.';
const POLLY_TEXT = 'Max Height probe.';
const MANTLE_URL = `https://bedrock-mantle.${REGION}.api.aws/anthropic/v1/messages`;

// The card says adaptive thinking "can be turned off" but its sample code names no field. This value is a
// guess to verify against the model card when S0-4 runs; override it without editing the script.
const THINKING_OFF: Record<string, unknown> = process.env.S0_THINKING_OFF_JSON
  ? (JSON.parse(process.env.S0_THINKING_OFF_JSON) as Record<string, unknown>)
  : { thinking: { type: 'disabled' } };

// Only the slice of each SDK client this script uses; the clients are loaded at run time, not imported.
interface Sender {
  send(command: unknown): Promise<unknown>;
}
type CommandCtor = new (input: Record<string, unknown>) => unknown;
interface Clients {
  bedrock: Sender;
  ConverseCommand: CommandCtor;
  polly: Sender;
  SynthesizeSpeechCommand: CommandCtor;
}

interface Probe {
  id: string;
  api: string;
  modelId: string;
  expected: string;
  run: (clients: Clients) => Promise<unknown>;
}

interface ProbeResult {
  id: string;
  date: string;
  api: string;
  model: string;
  expected: string;
  outcome: string;
  detail?: string;
}

class NotRunError extends Error {}
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(body);
    this.status = status;
  }
}

function converse(
  id: string,
  modelId: string,
  expected: string,
  extraFields?: Record<string, unknown>,
): Probe {
  return {
    id,
    api: 'bedrock-runtime Converse',
    modelId,
    expected,
    run: (clients) =>
      clients.bedrock.send(
        new clients.ConverseCommand({
          modelId,
          messages: [{ role: 'user', content: [{ text: PROMPT }] }],
          inferenceConfig: { maxTokens: 16 },
          ...(extraFields ? { additionalModelRequestFields: extraFields } : {}),
        }),
      ),
  };
}

const PROBES: Probe[] = [
  converse('S0-1', 'global.anthropic.claude-haiku-4-5-20251001-v1:0', 'denied'),
  converse('S0-2', 'us.anthropic.claude-haiku-4-5-20251001-v1:0', 'denied'),
  {
    id: 'S0-3',
    api: 'bedrock-mantle Messages',
    modelId: 'anthropic.claude-haiku-4-5',
    expected: 'unknown (W28)',
    run: async () => {
      const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
      if (!token) {
        throw new NotRunError('AWS_BEARER_TOKEN_BEDROCK is not set');
      }
      // Mantle rejects a request carrying both `authorization` and `x-api-key` (HTTP 401, 2026-10-29 run). AWS's
      // API-key docs (api-keys.html) send the key only as a bearer token.
      const res = await fetch(MANTLE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: 'anthropic.claude-haiku-4-5',
          max_tokens: 16,
          messages: [{ role: 'user', content: PROMPT }],
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        throw new HttpError(res.status, body);
      }
      return JSON.parse(body) as unknown;
    },
  },
  converse('S0-4', 'anthropic.claude-haiku-5-5', 'unknown (Q2)', THINKING_OFF),
  converse('S0-5', 'amazon.nova-2-lite-v1:0', 'denied or ValidationException'),
  converse('S0-6', 'amazon.nova-lite-v1:0', 'success'),
  {
    id: 'S0-7',
    api: 'Polly SynthesizeSpeech',
    modelId: 'Matthew / neural / mp3 / 24000',
    expected: 'success',
    run: (clients) =>
      clients.polly.send(
        new clients.SynthesizeSpeechCommand({
          Text: POLLY_TEXT,
          VoiceId: 'Matthew',
          Engine: 'neural',
          OutputFormat: 'mp3',
          SampleRate: '24000',
        }),
      ),
  },
];

const IAM_DENIAL = /no (identity|resource)-based policy allows|explicit deny in a|not authorized to perform/i;

const firstLine = (message: string): string => message.split(/\r?\n/)[0].slice(0, 300);

async function runProbe(probe: Probe, clients: Clients): Promise<ProbeResult> {
  const base = {
    id: probe.id,
    date: new Date().toISOString(),
    api: probe.api,
    model: probe.modelId,
    expected: probe.expected,
  };
  try {
    await probe.run(clients);
    return { ...base, outcome: 'success' };
  } catch (err) {
    if (err instanceof NotRunError) {
      return { ...base, outcome: 'not run', detail: firstLine(err.message) };
    }
    if (err instanceof HttpError) {
      return { ...base, outcome: `HTTP ${err.status}`, detail: firstLine(err.message) };
    }
    const error = err instanceof Error ? err : new Error(String(err));
    // An IAM denial happens before the plan check, so it proves nothing about the Free plan.
    if (IAM_DENIAL.test(error.message)) {
      return {
        ...base,
        outcome: 'INCONCLUSIVE: IAM denial, not plan evidence',
        detail: firstLine(error.message),
      };
    }
    return { ...base, outcome: error.name, detail: firstLine(error.message) };
  }
}

const toRow = (r: ProbeResult): string =>
  `| ${r.id} | ${r.date.slice(0, 10)} | ${r.api} | \`${r.model}\` | ${r.expected} | ${r.outcome} | ${(r.detail ?? '').replaceAll('|', '\\|')} |`;

function loadClients(): Clients {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const fromAgent = createRequire(path.join(root, 'packages/agent/package.json'));
  const fromFrontend = createRequire(path.join(root, 'packages/frontend/package.json'));
  const bedrockSdk = fromAgent('@aws-sdk/client-bedrock-runtime') as {
    BedrockRuntimeClient: new (config: { region: string }) => Sender;
    ConverseCommand: CommandCtor;
  };
  const pollySdk = fromFrontend('@aws-sdk/client-polly') as {
    PollyClient: new (config: { region: string }) => Sender;
    SynthesizeSpeechCommand: CommandCtor;
  };
  return {
    bedrock: new bedrockSdk.BedrockRuntimeClient({ region: REGION }),
    ConverseCommand: bedrockSdk.ConverseCommand,
    polly: new pollySdk.PollyClient({ region: REGION }),
    SynthesizeSpeechCommand: pollySdk.SynthesizeSpeechCommand,
  };
}

async function main(): Promise<void> {
  if (process.argv.includes('--dry-run')) {
    for (const p of PROBES) console.log(`${p.id}  ${p.api}  ${p.modelId}  expected: ${p.expected}`);
    console.log(
      `\nDry run: no calls made. Region ${REGION}. Thinking-off field: ${JSON.stringify(THINKING_OFF)}`,
    );
    return;
  }

  const clients = loadClients();
  const results: ProbeResult[] = [];
  for (const probe of PROBES) {
    const result = await runProbe(probe, clients);
    results.push(result);
    console.log(`${result.id}: ${result.outcome}${result.detail ? ` - ${result.detail}` : ''}`);
  }

  console.log('\n| # | Date | API | Model or voice | Expected | Outcome | First line of error |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of results) console.log(toRow(r));
  console.log(
    '\nPaste the table into research.md Q0 evidence. A probe that was not run is "not run", never a pass.',
  );
  if (results.some((r) => r.outcome.startsWith('INCONCLUSIVE'))) {
    console.log(
      'INCONCLUSIVE rows were blocked by IAM before the Free-plan check. Grant the action named in the error (bedrock:InvokeModel, or bedrock:CallWithBearerToken when AWS_BEARER_TOKEN_BEDROCK is set) and rerun; do not record them as denied-as-expected.',
    );
  }
}

await main();
