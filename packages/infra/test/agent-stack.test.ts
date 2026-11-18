import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { AgentStack } from '../lib/agent-stack.js';

const env = { account: '123456789012', region: 'us-west-2' };
const PROFILE_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const FOUNDATION_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0';

interface PolicyStatement {
  Action: string | string[];
  Resource: unknown;
  Condition?: Record<string, Record<string, unknown>>;
}

function build() {
  const app = new cdk.App();
  const deps = new cdk.Stack(app, 'Deps', { env });
  const userPool = new cognito.UserPool(deps, 'Pool');
  const userPoolClient = userPool.addClient('Client');
  const controlTable = new dynamodb.Table(deps, 'Control', {
    partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  });
  const stack = new AgentStack(app, 'TestAgentStack', {
    env,
    controlTable,
    memory: {
      memoryId: 'MaxHeightMemory-abc',
      memoryArn: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:memory/MaxHeightMemory-abc',
    },
    userPool,
    userPoolClient,
  });
  return { app, stack, template: Template.fromStack(stack) };
}

describe('AgentStack (AgentCore Runtime, T024)', () => {
  let app: cdk.App;
  let stack: AgentStack;
  let template: Template;

  beforeAll(() => {
    ({ app, stack, template } = build());
  });

  function runtimeProps(): Record<string, unknown> {
    const runtimes = template.findResources('AWS::BedrockAgentCore::Runtime');
    const ids = Object.keys(runtimes);
    expect(ids).toHaveLength(1);
    return runtimes[ids[0]].Properties as Record<string, unknown>;
  }

  function statements(): PolicyStatement[] {
    const policies = template.findResources('AWS::IAM::Policy');
    return Object.values(policies).flatMap(
      (p) =>
        (p.Properties as { PolicyDocument: { Statement: PolicyStatement[] } }).PolicyDocument
          .Statement,
    );
  }

  function statementsWith(action: string): PolicyStatement[] {
    return statements().filter((s) => ([] as string[]).concat(s.Action).includes(action));
  }

  test('creates one AgentCore Runtime on platform V2 with public networking', () => {
    const props = runtimeProps();
    expect(props.PlatformVersion).toBe('V2');
    expect(props.NetworkConfiguration).toEqual({ NetworkMode: 'PUBLIC' });
    expect(props.AgentRuntimeName).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
  });

  test('keeps sessions for 1800 s idle and 28800 s maximum (W25)', () => {
    expect(runtimeProps().LifecycleConfiguration).toEqual({
      IdleRuntimeSessionTimeout: 1800,
      MaxLifetime: 28800,
    });
  });

  test('authorizes inbound calls with a Cognito JWT for the app client only', () => {
    const jwt = (
      runtimeProps().AuthorizerConfiguration as { CustomJWTAuthorizer: Record<string, unknown> }
    ).CustomJWTAuthorizer;
    expect(JSON.stringify(jwt.DiscoveryUrl)).toContain('cognito-idp.us-west-2.amazonaws.com/');
    expect(JSON.stringify(jwt.DiscoveryUrl)).toContain('/.well-known/openid-configuration');
    expect(jwt.AllowedClients).toHaveLength(1);
    expect(JSON.stringify(jwt.AllowedClients)).toContain('PoolClient');
  });

  test('forwards only the Authorization header to the container', () => {
    expect(runtimeProps().RequestHeaderConfiguration).toEqual({
      RequestHeaderAllowlist: ['Authorization'],
    });
  });

  test('runs an arm64 container image built from packages/agent/Dockerfile', () => {
    const uri = JSON.stringify(
      (runtimeProps().AgentRuntimeArtifact as { ContainerConfiguration: { ContainerUri: unknown } })
        .ContainerConfiguration.ContainerUri,
    );
    expect(uri).toContain('container-assets');
    const assembly = app.synth();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(assembly.directory, `${stack.artifactId}.assets.json`), 'utf8'),
    ) as { dockerImages: Record<string, { source: { platform?: string; dockerFile?: string } }> };
    const images = Object.values(manifest.dockerImages);
    expect(images).toHaveLength(1);
    expect(images[0].source.platform).toBe('linux/arm64');
    expect(images[0].source.dockerFile).toBe('packages/agent/Dockerfile');
  });

  test('sets every decided runtime-config value', () => {
    const vars = runtimeProps().EnvironmentVariables as Record<string, unknown>;
    expect(vars).toMatchObject({
      AWS_REGION: 'us-west-2',
      MODEL_ID: PROFILE_ID,
      MAX_OUTPUT_TOKENS: '250',
      MEMORY_ID: 'MaxHeightMemory-abc',
      MEMORY_TOP_K: '10',
      POLLY_VOICE_ID: 'Matthew',
      POLLY_ENGINE: 'standard',
      POLLY_SAMPLE_RATE: '24000',
      SESSION_MAX_TURNS: '50',
      SESSION_MAX_TOKENS: '20000',
      SESSION_MAX_MINUTES: '30',
      RATE_LIMIT_PER_HOUR: '60',
      RATE_LIMIT_PER_DAY: '500',
      MESSAGE_MAX_CHARS: '2000',
      HISTORY_WINDOW: '40',
      // Spec 003 § Clarifications, Session 2026-11-15. These bound one turn's
      // spend and ingest; the runtime refuses to start without them.
      REQUEST_BODY_MAX_BYTES: '16384',
      MODEL_INPUT_MAX_BYTES: '32768',
      TOOL_RESULT_MAX_BYTES: '8192',
      TURN_MAX_MODEL_CALLS: '4',
      TURN_MAX_TOOL_EXECUTIONS: '4',
      TURN_MAX_GENERATED_TOKENS: '1000',
      TURN_MAX_BILLED_TOKENS: '64000',
      TURN_DEADLINE_MS: '60000',
      GLOBAL_MAX_ACTIVE_REQUESTS: '2',
      PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD: '1000000',
      PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD: '5000000',
      PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD: '0',
      PRICE_POLLY_PER_MCHAR_MICRO_USD: '4000000',
      PRICE_MEMORY_RETRIEVAL_MICRO_USD: '500',
      SSM_PARAM_WEATHER_KEY: '/max-height/weather-api-key',
      SSM_PARAM_NEWS_KEY: '/max-height/news-api-key',
    });
    expect(JSON.stringify(vars.CONTROL_TABLE_NAME)).toContain('Control');
  });

  test.each([
    // Constitution 1.9.0 P2's application layer (amendment A7): soft-degrade at
    // $11 of measured application spend, refuse new spend-bearing work at $15,
    // with $5 held back for lines the application never meters.
    ['BREAKER_DEGRADE_MICRO_USD', '11000000'],
    ['BREAKER_TRIP_MICRO_USD', '15000000'],
    // research.md § R-cost: $1.00 per GB at the 12 KiB billing minimum, which
    // MESSAGE_MAX_CHARS and MAX_OUTPUT_TOKENS keep every event under.
    ['PRICE_MEMORY_EVENT_MICRO_USD', '13'],
    // research.md § F: the average case's $0.66 of Runtime V2 over 795 turns.
    ['PRICE_RUNTIME_PER_TURN_MICRO_USD', '831'],
    // Spec 003 Session 2026-11-18: web search priced at $7 per 1,000 queries,
    // with the free monthly allowance not credited, and capped per session.
    ['PRICE_WEB_SEARCH_MICRO_USD', '7000'],
    ['SESSION_MAX_WEB_SEARCHES', '10'],
  ])('derives %s to %s', (name, value) => {
    expect(runtimeProps().EnvironmentVariables).toHaveProperty(name, value);
  });

  test('synthesizes with no underived-value errors', () => {
    Annotations.fromStack(stack).hasNoError('/TestAgentStack', Match.anyValue());
  });

  test('execution role trusts only AgentCore in this account', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Principal: { Service: 'bedrock-agentcore.amazonaws.com' },
            Condition: Match.objectLike({
              StringEquals: { 'aws:SourceAccount': '123456789012' },
            }),
          }),
        ],
      },
    });
  });

  test('invokes the model only through the global profile, with the three-statement pattern (T140)', () => {
    const invoke = statementsWith('bedrock:InvokeModel');
    expect(invoke).toHaveLength(3);
    const text = JSON.stringify(invoke);
    expect(text).toContain(`inference-profile/${PROFILE_ID}`);
    expect(text).toContain(`arn:aws:bedrock:us-west-2::foundation-model/${FOUNDATION_MODEL}`);
    expect(text).toContain(`arn:aws:bedrock:::foundation-model/${FOUNDATION_MODEL}`);
    const unspecified = invoke.find((s) =>
      JSON.stringify(s.Resource).includes('arn:aws:bedrock:::'),
    );
    expect(unspecified?.Condition?.StringEquals).toMatchObject({
      'aws:RequestedRegion': 'unspecified',
    });
    for (const s of invoke) {
      expect(([] as string[]).concat(s.Action).sort()).toEqual([
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ]);
    }
  });

  test('grants the warm-up probe bedrock:ListAsyncInvokes', () => {
    expect(statementsWith('bedrock:ListAsyncInvokes')).toHaveLength(1);
  });

  test('scopes Polly to us-west-2', () => {
    const [polly] = statementsWith('polly:SynthesizeSpeech');
    expect(polly.Condition?.StringEquals).toEqual({ 'aws:RequestedRegion': 'us-west-2' });
  });

  test('grants item-level access to the control table only', () => {
    const [ddb] = statementsWith('dynamodb:GetItem');
    expect(([] as string[]).concat(ddb.Action).sort()).toEqual([
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
    ]);
    expect(JSON.stringify(ddb.Resource)).toContain('Control');
  });

  test('grants the memory actions on the one memory ARN', () => {
    const [mem] = statementsWith('bedrock-agentcore:CreateEvent');
    expect(([] as string[]).concat(mem.Action).sort()).toEqual(
      [
        'bedrock-agentcore:BatchDeleteMemoryRecords',
        'bedrock-agentcore:CreateEvent',
        'bedrock-agentcore:DeleteEvent',
        'bedrock-agentcore:DeleteMemoryRecord',
        'bedrock-agentcore:GetMemoryRecord',
        'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:ListMemoryRecords',
        'bedrock-agentcore:ListSessions',
        'bedrock-agentcore:RetrieveMemoryRecords',
      ].sort(),
    );
    expect(mem.Resource).toBe(
      'arn:aws:bedrock-agentcore:us-west-2:123456789012:memory/MaxHeightMemory-abc',
    );
  });

  test('reads only the two SSM parameters, decrypting through SSM', () => {
    const [ssm] = statementsWith('ssm:GetParameter');
    expect(ssm.Resource).toHaveLength(2);
    const [kms] = statementsWith('kms:Decrypt');
    expect(kms.Condition?.StringEquals).toEqual({
      'kms:ViaService': 'ssm.us-west-2.amazonaws.com',
    });
  });

  test('may call only the AWS-managed web search tool, which needs no key', () => {
    const [search] = statementsWith('bedrock-agentcore:InvokeWebSearch');
    expect(search.Action).toBe('bedrock-agentcore:InvokeWebSearch');
    // The account field of an AWS-managed tool ARN is the literal "aws".
    expect(search.Resource).toBe('arn:aws:bedrock-agentcore:us-west-2:aws:tool/web-search.v1');
  });

  test('has no API Gateway, Lambda or WebSocket resources', () => {
    const types = Object.values(
      (template.toJSON().Resources ?? {}) as Record<string, { Type: string }>,
    ).map((r) => r.Type);
    expect(types.filter((t) => t.startsWith('AWS::ApiGatewayV2::'))).toEqual([]);
    expect(types).not.toContain('AWS::Lambda::Function');
  });

  test('exports the runtime ARN and ID', () => {
    template.hasOutput('RuntimeArn', {});
    template.hasOutput('RuntimeId', {});
  });
});
