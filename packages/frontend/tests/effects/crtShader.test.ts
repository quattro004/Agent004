import { describe, it, expect } from 'vitest';

describe('crtShader', () => {
  it('should export crtVertexShader as a non-empty string', async () => {
    const { crtVertexShader } = await import('../../src/effects/crtShader');
    expect(typeof crtVertexShader).toBe('string');
    expect(crtVertexShader.length).toBeGreaterThan(0);
  });

  it('should export crtFragmentShader as a non-empty string', async () => {
    const { crtFragmentShader } = await import('../../src/effects/crtShader');
    expect(typeof crtFragmentShader).toBe('string');
    expect(crtFragmentShader.length).toBeGreaterThan(0);
  });

  it('should reference tDiffuse uniform in the fragment shader', async () => {
    const { crtFragmentShader } = await import('../../src/effects/crtShader');
    expect(crtFragmentShader).toContain('tDiffuse');
  });

  it('should reference time uniform in the fragment shader', async () => {
    const { crtFragmentShader } = await import('../../src/effects/crtShader');
    expect(crtFragmentShader).toContain('time');
  });

  it('should reference glitchIntensity uniform in the fragment shader', async () => {
    const { crtFragmentShader } = await import('../../src/effects/crtShader');
    expect(crtFragmentShader).toContain('glitchIntensity');
  });

  it('should reference resolution uniform in the fragment shader', async () => {
    const { crtFragmentShader } = await import('../../src/effects/crtShader');
    expect(crtFragmentShader).toContain('resolution');
  });

  it('should export createCrtUniforms that returns correct uniform keys', async () => {
    const { createCrtUniforms } = await import('../../src/effects/crtShader');
    const uniforms = createCrtUniforms();

    expect(uniforms).toHaveProperty('tDiffuse');
    expect(uniforms).toHaveProperty('time');
    expect(uniforms).toHaveProperty('glitchIntensity');
    expect(uniforms).toHaveProperty('resolution');
  });

  it('should set initial uniform values', async () => {
    const { createCrtUniforms } = await import('../../src/effects/crtShader');
    const uniforms = createCrtUniforms();

    expect(uniforms.time.value).toBe(0);
    expect(uniforms.glitchIntensity.value).toBe(0);
    expect(uniforms.tDiffuse.value).toBeNull();
  });
});
