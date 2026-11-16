import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { assertBuildConfig, BUILD_MARKER_FILE, buildMarker } from './src/config/buildConfig';

/**
 * Fails a production build whose VITE_* configuration is incomplete, so a
 * broken client never reaches CloudFront (contracts/runtime-config.md), and
 * records whether the build is publishable for the infra publisher.
 */
function requireBuildConfig(mode: string): PluginOption {
  const buildEnv = () => ({ ...process.env, ...loadEnv(mode, process.cwd(), 'VITE_') });
  return {
    name: 'max-height-require-build-config',
    apply: 'build',
    configResolved() {
      assertBuildConfig(buildEnv(), buildMarker(buildEnv(), mode).deploy);
    },
    generateBundle() {
      // Not part of the site: the infra publisher reads it, then excludes it.
      this.emitFile({
        type: 'asset',
        fileName: BUILD_MARKER_FILE,
        source: JSON.stringify(buildMarker(buildEnv(), mode)),
      });
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
