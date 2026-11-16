import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { assertBuildConfig, isDeployBuild } from './src/config/buildConfig';

/**
 * Fails a production build whose VITE_* configuration is incomplete, so a
 * broken client never reaches CloudFront (contracts/runtime-config.md).
 */
function requireBuildConfig(mode: string): PluginOption {
  return {
    name: 'max-height-require-build-config',
    apply: 'build',
    configResolved() {
      const env = { ...process.env, ...loadEnv(mode, process.cwd(), 'VITE_') };
      assertBuildConfig(env, isDeployBuild(env, mode));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), requireBuildConfig(mode)],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}));
