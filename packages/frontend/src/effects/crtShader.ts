/**
 * CRT post-processing shader for WebGL.
 * Scanlines, chromatic aberration, barrel distortion, glitch tears, vignette.
 */

export const crtVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const crtFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  uniform float glitchIntensity;
  uniform vec2 resolution;

  varying vec2 vUv;

  // Barrel distortion
  vec2 barrelDistort(vec2 uv) {
    vec2 centered = uv - 0.5;
    float dist = dot(centered, centered);
    float strength = 0.15;
    return uv + centered * dist * strength;
  }

  // Chromatic aberration
  vec3 chromaticAberration(sampler2D tex, vec2 uv, float amount) {
    float r = texture2D(tex, uv + vec2(amount, 0.0)).r;
    float g = texture2D(tex, uv).g;
    float b = texture2D(tex, uv - vec2(amount, 0.0)).b;
    return vec3(r, g, b);
  }

  // Pseudo-random
  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = barrelDistort(vUv);

    // Glitch tear: horizontal band displacement
    float tearBand = step(0.98 - glitchIntensity * 0.3, rand(vec2(floor(time * 8.0), floor(uv.y * 20.0))));
    uv.x += tearBand * 0.03 * glitchIntensity;

    // Chromatic aberration
    float aberrationAmount = 0.002 + glitchIntensity * 0.005;
    vec3 color = chromaticAberration(tDiffuse, uv, aberrationAmount);

    // Scanlines
    float scanline = sin(uv.y * resolution.y * 1.5) * 0.04;
    color -= scanline;

    // Vignette
    vec2 vignetteUv = vUv - 0.5;
    float vignette = 1.0 - dot(vignetteUv, vignetteUv) * 1.2;
    color *= vignette;

    // Brightness flicker
    float flicker = 1.0 + sin(time * 60.0) * 0.005;
    color *= flicker;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface CrtUniforms {
  tDiffuse: { value: null | unknown };
  time: { value: number };
  glitchIntensity: { value: number };
  resolution: { value: [number, number] };
}

export function createCrtUniforms(): CrtUniforms {
  return {
    tDiffuse: { value: null },
    time: { value: 0 },
    glitchIntensity: { value: 0 },
    resolution: { value: [1920, 1080] },
  };
}
