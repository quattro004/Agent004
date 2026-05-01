import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';

// --- Constants ---

/** Presigned URL time-to-live: 5 minutes per websocket-api.md */
export const PRESIGNED_URL_TTL_MS = 300_000;

/** Buffer before credential expiration to trigger refresh (30 seconds) */
const EXPIRATION_BUFFER_MS = 30_000;

// --- Types ---

export interface GuestCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

// --- Functions ---

/**
 * Check if credentials are expired or about to expire (within 30s buffer).
 */
export function isCredentialExpired(expiration: Date): boolean {
  return expiration.getTime() - Date.now() < EXPIRATION_BUFFER_MS;
}

/**
 * Get guest credentials from Cognito Identity Pool (unauthenticated flow).
 */
export async function getGuestCredentials(
  identityPoolId: string,
  client?: CognitoIdentityClient,
): Promise<GuestCredentials> {
  const cognitoClient = client ?? new CognitoIdentityClient({
    region: identityPoolId.split(':')[0],
  });

  // Step 1: Get an identity ID
  const idResponse = await cognitoClient.send(
    new GetIdCommand({ IdentityPoolId: identityPoolId }),
  );

  const identityId = idResponse.IdentityId;
  if (!identityId) {
    throw new Error('Failed to obtain Cognito identity ID');
  }

  // Step 2: Get credentials for that identity
  const credResponse = await cognitoClient.send(
    new GetCredentialsForIdentityCommand({ IdentityId: identityId }),
  );

  const creds = credResponse.Credentials;
  if (!creds || !creds.AccessKeyId || !creds.SecretKey || !creds.SessionToken) {
    throw new Error('Failed to obtain guest credentials from Cognito');
  }

  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration ?? new Date(Date.now() + 3600_000),
  };
}

/**
 * Generate a SigV4 presigned WebSocket URL for API Gateway.
 * Uses AWS Signature Version 4 query string authentication.
 */
export async function generatePresignedWsUrl(
  credentials: GuestCredentials,
  endpoint: string,
  region: string,
  stage: string = 'production',
): Promise<string> {
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8);
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const service = 'execute-api';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${credentials.accessKeyId}/${credentialScope}`;
  const host = endpoint;
  const path = `/${stage}`;

  // Build the canonical query string for SigV4 (must be sorted by param name)
  const params = new URLSearchParams();
  params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  params.set('X-Amz-Credential', credential);
  params.set('X-Amz-Date', amzDate);
  params.set('X-Amz-Expires', String(Math.floor(PRESIGNED_URL_TTL_MS / 1000)));
  params.set('X-Amz-Security-Token', credentials.sessionToken);
  params.set('X-Amz-SignedHeaders', 'host');

  // Sort params alphabetically for canonical query string
  const sortedParams = new URLSearchParams([...params.entries()].sort());
  const canonicalQueryString = sortedParams.toString();

  // Canonical request per SigV4 spec
  const canonicalRequest = [
    'GET',
    path,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA-256 of empty body
  ].join('\n');

  // String to sign
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  // Derive signing key
  const signingKey = await deriveSigningKey(
    credentials.secretAccessKey,
    dateStamp,
    region,
    service,
  );

  // Compute signature
  const signature = await hmacHex(signingKey, stringToSign);

  // Append signature to params
  sortedParams.set('X-Amz-Signature', signature);

  return `wss://${endpoint}${path}?${sortedParams.toString()}`;
}

// --- SigV4 Crypto Helpers (Web Crypto API) ---

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const result = await hmac(key, data);
  return bufferToHex(result);
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data),
  );
  return bufferToHex(hash);
}

async function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(
    new TextEncoder().encode(`AWS4${secretKey}`).buffer as ArrayBuffer,
    dateStamp,
  );
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
