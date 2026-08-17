import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BACKGROUND_CYCLE_MS,
  BACKGROUND_FRAME_COUNT,
  BACKGROUND_ASSET_BASE,
} from '../config/constants';

function shuffleArray(arr: number[]): number[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createShuffledQueue(excludeLast?: number): number[] {
  const indices = Array.from({ length: BACKGROUND_FRAME_COUNT }, (_, i) => i);
  const shuffled = shuffleArray(indices);
  // Avoid immediate repeat across cycle boundaries
  if (excludeLast !== undefined && shuffled[0] === excludeLast) {
    const swapIdx = shuffled.length > 1 ? 1 : 0;
    [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
  }
  return shuffled;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

export function BackgroundCycler() {
  const prefersReduced = usePrefersReducedMotion();
  const queueRef = useRef<number[]>(createShuffledQueue());
  const indexRef = useRef(0);
  const [currentFrame, setCurrentFrame] = useState(() => queueRef.current[0]);

  const advance = useCallback(() => {
    indexRef.current += 1;
    if (indexRef.current >= queueRef.current.length) {
      const lastFrame = queueRef.current[queueRef.current.length - 1];
      queueRef.current = createShuffledQueue(lastFrame);
      indexRef.current = 0;
    }
    setCurrentFrame(queueRef.current[indexRef.current]);
  }, []);

  // Preload all frames on mount
  useEffect(() => {
    for (let i = 0; i < BACKGROUND_FRAME_COUNT; i++) {
      const img = new Image();
      img.src = `${BACKGROUND_ASSET_BASE}/frame-${i}.png`;
    }
  }, []);

  // Cycle timer
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(advance, BACKGROUND_CYCLE_MS);
    return () => clearInterval(id);
  }, [prefersReduced, advance]);

  const src = `${BACKGROUND_ASSET_BASE}/frame-${currentFrame}.png`;

  return <img src={src} alt="" data-testid="background-frame" className="crt-background-cycler" />;
}
