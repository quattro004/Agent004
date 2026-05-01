import {
  APIGatewayProxyWebsocketHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE ?? '';
const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN ?? '';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (
  event
): Promise<APIGatewayProxyResultV2> => {
  const { requestContext } = event;
  const connectionId = requestContext.connectionId;
  const routeKey = requestContext.routeKey;

  switch (routeKey) {
    case '$connect':
      return handleConnect(connectionId);
    case '$disconnect':
      return handleDisconnect(connectionId);
    case '$default':
      return handleDefault(connectionId, event.body ?? '', requestContext);
    default:
      return { statusCode: 400 };
  }
};

async function handleConnect(connectionId: string): Promise<APIGatewayProxyResultV2> {
  // Connection validated by API Gateway authorizer (SigV4/IAM)
  // In production: store connectionId in DynamoDB connections table
  console.log(`Connected: ${connectionId}`);
  return { statusCode: 200 };
}

async function handleDisconnect(connectionId: string): Promise<APIGatewayProxyResultV2> {
  // In production: remove from DynamoDB, trigger session_end if active
  console.log(`Disconnected: ${connectionId}`);
  return { statusCode: 200 };
}

async function handleDefault(
  connectionId: string,
  body: string,
  requestContext: { domainName?: string; stage?: string }
): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return { statusCode: 400 };
  }

  let message: { type: string; payload?: unknown };
  try {
    message = JSON.parse(body);
  } catch {
    await sendToConnection(connectionId, requestContext, {
      type: 'error',
      payload: { code: 'INVALID_JSON', message: 'Message must be valid JSON' },
    });
    return { statusCode: 400 };
  }

  if (!message.type) {
    await sendToConnection(connectionId, requestContext, {
      type: 'error',
      payload: { code: 'MISSING_TYPE', message: 'Message must include a type field' },
    });
    return { statusCode: 400 };
  }

  const validTypes = new Set([
    'session_start',
    'user_message',
    'interrupt',
    'session_resume',
    'session_end',
  ]);

  if (!validTypes.has(message.type)) {
    await sendToConnection(connectionId, requestContext, {
      type: 'error',
      payload: { code: 'UNKNOWN_TYPE', message: `Unknown message type: ${message.type}` },
    });
    return { statusCode: 400 };
  }

  // Route to AgentCore InvokeAgentRuntime
  // In production: invoke agent, stream response chunks back as agent_token frames
  switch (message.type) {
    case 'session_start':
      await sendToConnection(connectionId, requestContext, {
        type: 'connection_ack',
        payload: { sessionId: `session-${Date.now()}` },
      });
      break;
    case 'session_end':
      await sendToConnection(connectionId, requestContext, {
        type: 'session_state_change',
        payload: { state: 'ENDED' },
      });
      break;
    default:
      // user_message, interrupt, session_resume → forward to agent
      await sendToConnection(connectionId, requestContext, {
        type: 'agent_turn_complete',
        payload: { turnIndex: 0 },
      });
      break;
  }

  return { statusCode: 200 };
}

async function sendToConnection(
  connectionId: string,
  requestContext: { domainName?: string; stage?: string },
  data: unknown
): Promise<void> {
  const endpoint = `https://${requestContext.domainName}/${requestContext.stage}`;
  const client = new ApiGatewayManagementApiClient({ endpoint });
  const command = new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(data)),
  });
  try {
    await client.send(command);
  } catch (err: unknown) {
    const error = err as { statusCode?: number };
    if (error.statusCode === 410) {
      // Connection is gone, clean up
      console.log(`Stale connection: ${connectionId}`);
    } else {
      throw err;
    }
  }
}
