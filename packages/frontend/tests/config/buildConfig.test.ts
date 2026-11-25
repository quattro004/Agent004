import { describe, it, expect } from 'vitest';
import {
  REQUIRED_VITE_VARS,
  assertBuildConfig,
  buildMarker,
  isDeployBuild,
  readBuildConfig,
} from '../../src/config/buildConfig';

const COMPLETE: Record<string, string> = {
  VITE_RUNTIME_ARN: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/max_height-Ab',
  VITE_COGNITO_DOMAIN: 'https://example.auth.us-west-2.amazoncognito.com',
  VITE_COGNITO_CLIENT_ID: '1example23clientid',
  VITE_REDIRECT_URI: 'https://max.recipieces.com/auth/callback',
  VITE_SIGN_OUT_URI: 'https://max.recipieces.com/',
};

describe('buildConfig', () => {
  it('requires exactly the five variables the deploy step writes', () => {
    expect([...REQUIRED_VITE_VARS]).toEqual([
      'VITE_RUNTIME_ARN',
      'VITE_COGNITO_DOMAIN',
      'VITE_COGNITO_CLIENT_ID',
      'VITE_REDIRECT_URI',
      'VITE_SIGN_OUT_URI',
    ]);
  });

  it('no longer reads VITE_WS_URL', () => {
    expect([...REQUIRED_VITE_VARS]).not.toContain('VITE_WS_URL');
  });

  it('accepts a complete production environment', () => {
    expect(() => assertBuildConfig(COMPLETE, true)).not.toThrow();
  });

  it.each([...REQUIRED_VITE_VARS])('fails a production build when %s is missing', (name) => {
    const env = { ...COMPLETE };
    delete env[name];

    expect(() => assertBuildConfig(env, true)).toThrow(new RegExp(name));
  });

  it('rejects a variable that is present but blank', () => {
    expect(() => assertBuildConfig({ ...COMPLETE, VITE_RUNTIME_ARN: '   ' }, true)).toThrow(
      /VITE_RUNTIME_ARN/,
    );
  });

  it('names every missing variable at once, so one build reveals them all', () => {
    expect(() => assertBuildConfig({}, true)).toThrow(/VITE_SIGN_OUT_URI/);
    expect(() => assertBuildConfig({}, true)).toThrow(/VITE_RUNTIME_ARN/);
  });

  it('leaves a development build alone', () => {
    expect(() => assertBuildConfig({}, false)).not.toThrow();
  });

  it('reads the values a development build does supply', () => {
    expect(readBuildConfig(COMPLETE).runtimeArn).toBe(COMPLETE.VITE_RUNTIME_ARN);
    expect(readBuildConfig({}).runtimeArn).toBe('');
  });

  describe('which builds the check applies to', () => {
    it('applies to a build the deploy step marks as its own', () => {
      expect(isDeployBuild({ MAX_HEIGHT_DEPLOY: '1' }, 'production')).toBe(true);
    });

    it('applies to a partly configured build, because that is always a mistake', () => {
      expect(isDeployBuild({ VITE_RUNTIME_ARN: 'arn:aws:…' }, 'production')).toBe(true);
    });

    it('leaves an unconfigured production build alone, so CI can compile the client', () => {
      expect(isDeployBuild({}, 'production')).toBe(false);
    });

    it('never applies outside a production build', () => {
      expect(isDeployBuild({ MAX_HEIGHT_DEPLOY: '1', ...COMPLETE }, 'development')).toBe(false);
    });
  });

  describe('the marker a build leaves for the publisher', () => {
    it('says a complete deploy build is publishable', () => {
      expect(buildMarker({ MAX_HEIGHT_DEPLOY: '1', ...COMPLETE }, 'production')).toEqual({
        deploy: true,
      });
    });

    it('says a compile-check build with no configuration is not publishable', () => {
      expect(buildMarker({}, 'production')).toEqual({ deploy: false });
    });

    it('never calls a development build publishable', () => {
      expect(buildMarker({ MAX_HEIGHT_DEPLOY: '1', ...COMPLETE }, 'development')).toEqual({
        deploy: false,
      });
    });
  });
});
