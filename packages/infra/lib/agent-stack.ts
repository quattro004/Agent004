import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as bedrockagentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AgentStackProps extends cdk.StackProps {
  controlTable: dynamodb.ITable;
  memory: { memoryId: string; memoryArn: string };
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DOCKERFILE = 'packages/agent/Dockerfile';

const FOUNDATION_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0';
const INFERENCE_PROFILE = `global.${FOUNDATION_MODEL}`;

const SSM_PARAMS = {
  SSM_PARAM_WEATHER_KEY: '/max-height/weather-api-key',
  SSM_PARAM_NEWS_KEY: '/max-height/news-api-key',
  SSM_PARAM_SEARCH_KEY: '/max-height/search-api-key',
  SSM_PARAM_SEARCH_ENGINE_ID: '/max-height/search-engine-id',
};

// contracts/runtime-config.md § Agent runtime.
const RUNTIME_CONFIG: Record<string, string> = {
  AWS_REGION: 'us-west-2',
  MODEL_ID: INFERENCE_PROFILE,
  MAX_OUTPUT_TOKENS: '250',
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
  // Spec 003 § Clarifications, Session 2026-11-15: the approved per-turn
  // bounds. They are set here rather than defaulted in the runtime so a stack
  // that forgot one fails at startup instead of spending more than approved.
  REQUEST_BODY_MAX_BYTES: '16384',
  MODEL_INPUT_MAX_BYTES: '32768',
  TOOL_RESULT_MAX_BYTES: '8192',
  TURN_MAX_MODEL_CALLS: '4',
  TURN_MAX_TOOL_EXECUTIONS: '4',
  TURN_MAX_GENERATED_TOKENS: '1000',
  TURN_MAX_BILLED_TOKENS: '64000',
  TURN_DEADLINE_MS: '60000',
  // Constitution 1.9.0 P2 / spec 003 Session 2026-11-15: two spend-bearing
  // requests in flight across every runtime instance, one per friend (the
  // per-friend limit is the lease key itself, so it has no variable).
  GLOBAL_MAX_ACTIVE_REQUESTS: '2',
  // Constitution 1.9.0 P2's application layer (amendment A7, T117): the
  // application soft-degrades at $11 of its own measured spend and refuses new
  // spend-bearing work at $15, holding $5 back for lines it never meters. These
  // are no longer the F-derived (16 − F)/(20 − F) figures; the reservation
  // replaced the subtraction. The gross $10/$16/$20 AWS layer is unchanged.
  BREAKER_DEGRADE_MICRO_USD: '11000000',
  BREAKER_TRIP_MICRO_USD: '15000000',
  PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD: '1000000',
  PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD: '5000000',
  PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD: '0',
  PRICE_POLLY_PER_MCHAR_MICRO_USD: '4000000',
  // T082, research.md § R-cost: $1.00 per GB with a 12 KiB billing minimum.
  // MESSAGE_MAX_CHARS (2,000) and MAX_OUTPUT_TOKENS (250) keep every event
  // well under that minimum, so each one bills at it. 12 KiB of $1.00/GB is
  // 11.44 µUSD read as GiB and 12.29 µUSD read as a decimal GB; 13 rounds the
  // larger reading up, so the tally cannot undercount under either.
  PRICE_MEMORY_EVENT_MICRO_USD: '13',
  PRICE_MEMORY_RETRIEVAL_MICRO_USD: '500',
  // T082, research.md § F: Runtime V2 CPU ($0.06) plus memory ($0.60) over the
  // average case's 795 turns is $0.00083019 a turn. The average case is used
  // because it is the dearer of the two per turn — the full case spreads a
  // longer session's billed memory across more turns ($0.33 over 800).
  PRICE_RUNTIME_PER_TURN_MICRO_USD: '831',
  ...SSM_PARAMS,
};

/** The agent image's build context is the repo root, filtered by the agent's own ignore file. */
function imageExcludes(): string[] {
  const ignore = fs.readFileSync(path.join(REPO_ROOT, `${DOCKERFILE}.dockerignore`), 'utf8');
  const patterns = ignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  return [...patterns, `!${DOCKERFILE}`];
}

export class AgentStack extends cdk.Stack {
  public readonly runtime: bedrockagentcore.CfnRuntime;
  public readonly executionRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    const image = new ecrAssets.DockerImageAsset(this, 'AgentImage', {
      directory: REPO_ROOT,
      file: DOCKERFILE,
      exclude: imageExcludes(),
      platform: ecrAssets.Platform.LINUX_ARM64,
    });

    this.executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
          },
        },
      }),
    });
    this.grantRuntimePermissions(props, image);

    const environmentVariables: Record<string, string> = {
      CONTROL_TABLE_NAME: props.controlTable.tableName,
      MEMORY_ID: props.memory.memoryId,
      ...RUNTIME_CONFIG,
    };

    this.runtime = new bedrockagentcore.CfnRuntime(this, 'Runtime', {
      agentRuntimeName: 'MaxHeightAgent',
      agentRuntimeArtifact: { containerConfiguration: { containerUri: image.imageUri } },
      platformVersion: 'V2',
      roleArn: this.executionRole.roleArn,
      networkConfiguration: { networkMode: 'PUBLIC' },
      protocolConfiguration: 'HTTP',
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}/.well-known/openid-configuration`,
          allowedClients: [props.userPoolClient.userPoolClientId],
        },
      },
      requestHeaderConfiguration: { requestHeaderAllowlist: ['Authorization'] },
      lifecycleConfiguration: { idleRuntimeSessionTimeout: 1800, maxLifetime: 28800 },
      environmentVariables,
    });
    this.runtime.node.addDependency(this.executionRole);

    new cdk.CfnOutput(this, 'RuntimeArn', { value: this.runtime.attrAgentRuntimeArn });
    new cdk.CfnOutput(this, 'RuntimeId', { value: this.runtime.attrAgentRuntimeId });
  }

  private grantRuntimePermissions(props: AgentStackProps, image: ecrAssets.DockerImageAsset): void {
    const role = this.executionRole;
    const invoke = ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'];
    const profileArn = `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${INFERENCE_PROFILE}`;

    // Global cross-Region inference: the profile, the in-Region model through the
    // profile, and the Region-less model ARN the global route resolves to (T140).
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: invoke,
        resources: [profileArn],
        conditions: { StringEquals: { 'aws:RequestedRegion': this.region } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: invoke,
        resources: [`arn:aws:bedrock:${this.region}::foundation-model/${FOUNDATION_MODEL}`],
        conditions: {
          StringEquals: {
            'aws:RequestedRegion': this.region,
            'bedrock:InferenceProfileArn': profileArn,
          },
        },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: invoke,
        resources: [`arn:aws:bedrock:::foundation-model/${FOUNDATION_MODEL}`],
        conditions: {
          StringEquals: {
            'aws:RequestedRegion': 'unspecified',
            'bedrock:InferenceProfileArn': profileArn,
          },
        },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({ actions: ['bedrock:ListAsyncInvokes'], resources: ['*'] }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
        conditions: { StringEquals: { 'aws:RequestedRegion': this.region } },
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [props.controlTable.tableArn],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock-agentcore:CreateEvent',
          'bedrock-agentcore:ListSessions',
          'bedrock-agentcore:ListEvents',
          'bedrock-agentcore:DeleteEvent',
          'bedrock-agentcore:RetrieveMemoryRecords',
          'bedrock-agentcore:ListMemoryRecords',
          'bedrock-agentcore:GetMemoryRecord',
          'bedrock-agentcore:DeleteMemoryRecord',
          'bedrock-agentcore:BatchDeleteMemoryRecords',
        ],
        resources: [props.memory.memoryArn],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: Object.values(SSM_PARAMS).map(
          (name) => `arn:aws:ssm:${this.region}:${this.account}:parameter${name}`,
        ),
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [`arn:aws:kms:${this.region}:${this.account}:key/*`],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    );

    image.repository.grantPull(role);

    // AgentCore Runtime execution-role requirements (devguide runtime-permissions).
    const runtimeLogs = `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`;
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup'],
        resources: [runtimeLogs],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`${runtimeLogs}:log-stream:*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: { StringEquals: { 'cloudwatch:namespace': 'bedrock-agentcore' } },
      }),
    );
  }
}
