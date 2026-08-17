import { describe, it, expect, vi } from 'vitest';
import {
  generatePresignedWsUrl,
  getGuestCredentials,
  isCredentialExpired,
  PRESIGNED_URL_TTL_MS,
} from '../../src/services/cognitoAuth';

// Mock the AWS SDK
vi.mock('@aws-sdk/client-cognito-identity', () => ({
  CognitoIdentityClient: vi.fn(function () {
    return {
      send: vi.fn(),
    };
  }),
  GetIdCommand: vi.fn(),
  GetCredentialsForIdentityCommand: vi.fn(),
}));

describe('Cognito Auth Service', () => {
  describe('PRESIGNED_URL_TTL_MS', () => {
    it('should be 5 minutes (300000ms)', () => {
      expect(PRESIGNED_URL_TTL_MS).toBe(300_000);
    });
  });

  describe('isCredentialExpired', () => {
    it('should return true when expiration is in the past', () => {
      const pastDate = new Date(Date.now() - 60_000);
      expect(isCredentialExpired(pastDate)).toBe(true);
    });

    it('should return true when expiration is within 30 second buffer', () => {
      // Credential expires in 20 seconds — considered expired due to 30s buffer
      const nearFuture = new Date(Date.now() + 20_000);
      expect(isCredentialExpired(nearFuture)).toBe(true);
    });

    it('should return false when expiration is more than 30 seconds away', () => {
      const future = new Date(Date.now() + 120_000);
      expect(isCredentialExpired(future)).toBe(false);
    });
  });

  describe('generatePresignedWsUrl', () => {
    const credentials = {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'FwoGZXIvYXdzEBYaDExample',
      expiration: new Date(Date.now() + 300_000),
    };
    const endpoint = 'abcdef1234.execute-api.us-east-1.amazonaws.com';
    const region = 'us-east-1';

    it('should produce a wss:// URL', async () => {
      const url = await generatePresignedWsUrl(credentials, endpoint, region);

      expect(url).toMatch(/^wss:\/\//);
      expect(url).toContain(endpoint);
    });

    it('should include the stage path in the URL', async () => {
      const stage = 'production';
      const url = await generatePresignedWsUrl(credentials, endpoint, region, stage);

      expect(url).toContain(`/${stage}`);
    });

    it('should include X-Amz-Security-Token for temporary credentials', async () => {
      const url = await generatePresignedWsUrl(credentials, endpoint, region);

      expect(url).toContain('X-Amz-Security-Token=');
    });

    it('should produce a real SigV4 signature (64-char hex string)', async () => {
      const url = await generatePresignedWsUrl(credentials, endpoint, region);
      const parsedUrl = new URL(url);
      const signature = parsedUrl.searchParams.get('X-Amz-Signature');

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce a deterministic signature for the same inputs', async () => {
      const fixedDate = new Date('2026-05-01T12:00:00.000Z');
      vi.setSystemTime(fixedDate);

      const url1 = await generatePresignedWsUrl(credentials, endpoint, region);
      const url2 = await generatePresignedWsUrl(credentials, endpoint, region);

      expect(url1).toBe(url2);

      vi.useRealTimers();
    });

    it('should include all required SigV4 query parameters', async () => {
      const url = await generatePresignedWsUrl(credentials, endpoint, region);
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
      expect(parsedUrl.searchParams.get('X-Amz-Credential')).toContain(credentials.accessKeyId);
      expect(parsedUrl.searchParams.get('X-Amz-Date')).toMatch(/^\d{8}T\d{6}Z$/);
      expect(parsedUrl.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(parsedUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    });
  });

  describe('getGuestCredentials', () => {
    it('should return credentials with accessKeyId, secretAccessKey, sessionToken, and expiration', async () => {
      // This test requires AWS SDK mock setup — validates the interface contract
      const mockIdentityPoolId = 'us-east-1:12345678-1234-1234-1234-123456789012';

      // Override the mock to return expected results
      const { CognitoIdentityClient } = await import('@aws-sdk/client-cognito-identity');
      const mockClient = new CognitoIdentityClient({});
      (mockClient.send as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ IdentityId: 'us-east-1:identity-abc' })
        .mockResolvedValueOnce({
          Credentials: {
            AccessKeyId: 'AKIATEST',
            SecretKey: 'testSecret',
            SessionToken: 'testToken',
            Expiration: new Date(Date.now() + 3600_000),
          },
        });

      const result = await getGuestCredentials(mockIdentityPoolId, mockClient);

      expect(result.accessKeyId).toBe('AKIATEST');
      expect(result.secretAccessKey).toBe('testSecret');
      expect(result.sessionToken).toBe('testToken');
      expect(result.expiration).toBeInstanceOf(Date);
    });

    it('should throw if identity pool returns no credentials', async () => {
      const mockIdentityPoolId = 'us-east-1:12345678-1234-1234-1234-123456789012';

      const { CognitoIdentityClient } = await import('@aws-sdk/client-cognito-identity');
      const mockClient = new CognitoIdentityClient({});
      (mockClient.send as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ IdentityId: 'us-east-1:identity-abc' })
        .mockResolvedValueOnce({ Credentials: null });

      await expect(getGuestCredentials(mockIdentityPoolId, mockClient)).rejects.toThrow(
        /credentials/i,
      );
    });
  });
});
