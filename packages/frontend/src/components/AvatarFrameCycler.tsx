import { useState, useEffect, useRef } from 'react';

export type AvatarFrame = 'idle' | 'talk-1' | 'talk-2' | 'glitch' | 'blink' | 'laugh' | 'side-eye';
export type AvatarTheme = 'retro' | 'pop-art' | 'cartoon';

const ALL_FRAMES: AvatarFrame[] = [
  'idle',
  'talk-1',
  'talk-2',
  'glitch',
  'blink',
  'laugh',
  'side-eye',
];

interface AvatarFrameCyclerProps {
  isMouthOpen: boolean;
  theme?: AvatarTheme;
  /**
   * When provided, this frame is rendered unconditionally and all internal
   * timers (blink, glitch, laugh, side-eye, talk) are ignored for selection
   * purposes. Useful for driving deterministic sequences like the TV
   * tune-in glitch flashes.
   */
  forceFrame?: AvatarFrame;
}

function useAvatarFrame({ isMouthOpen, theme = 'retro' }: AvatarFrameCyclerProps) {
  const [isGlitching, setIsGlitching] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isLaughing, setIsLaughing] = useState(false);
  const [isSideEye, setIsSideEye] = useState(false);
  const [talkToggle, setTalkToggle] = useState(false);
  const prevMouthOpenRef = useRef(false);

  // Alternate talk frames on each false→true mouth transition
  useEffect(() => {
    if (isMouthOpen && !prevMouthOpenRef.current) {
      setTalkToggle((prev) => !prev);
    }
    prevMouthOpenRef.current = isMouthOpen;
  }, [isMouthOpen]);

  // Recursive glitch timer: flash every 3–8s for 100–200ms
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 3000 + Math.random() * 5000;
      timeoutId = setTimeout(() => {
        setIsGlitching(true);
        const duration = 100 + Math.random() * 100;
        timeoutId = setTimeout(() => {
          setIsGlitching(false);
          schedule();
        }, duration);
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  // Recursive blink timer: blink every 5–9s for 300ms (calm, lifelike cadence)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 5000 + Math.random() * 4000;
      timeoutId = setTimeout(() => {
        setIsBlinking(true);
        timeoutId = setTimeout(() => {
          setIsBlinking(false);
          schedule();
        }, 300);
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  // Recursive laugh timer: laugh every 8–15s for 800ms
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 8000 + Math.random() * 7000;
      timeoutId = setTimeout(() => {
        setIsLaughing(true);
        timeoutId = setTimeout(() => {
          setIsLaughing(false);
          schedule();
        }, 800);
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  // Recursive side-eye timer: side-eye every 10–20s for 1200ms
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 10000 + Math.random() * 10000;
      timeoutId = setTimeout(() => {
        setIsSideEye(true);
        timeoutId = setTimeout(() => {
          setIsSideEye(false);
          schedule();
        }, 1200);
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  // Preload all frames to avoid flicker on first display
  useEffect(() => {
    ALL_FRAMES.forEach((f) => {
      const img = new Image();
      img.src = `/avatar/${theme}/${f}.png`;
    });
  }, [theme]);

  // Derive visible frame from independent state flags (priority order)
  const talkFrame: AvatarFrame = talkToggle ? 'talk-1' : 'talk-2';
  const frame: AvatarFrame = isGlitching
    ? 'glitch'
    : isBlinking
      ? 'blink'
      : isMouthOpen
        ? talkFrame
        : isLaughing
          ? 'laugh'
          : isSideEye
            ? 'side-eye'
            : 'idle';

  return { src: `/avatar/${theme}/${frame}.png`, frame };
}

export function AvatarFrameCycler({ isMouthOpen, theme, forceFrame }: AvatarFrameCyclerProps) {
  const { src, frame } = useAvatarFrame({ isMouthOpen, theme });
  const displayFrame = forceFrame ?? frame;
  const displaySrc = forceFrame ? `/avatar/${theme ?? 'retro'}/${forceFrame}.png` : src;

  return (
    <img
      src={displaySrc}
      alt=""
      data-testid="avatar-frame"
      data-frame={displayFrame}
      className="avatar-frame-cycler"
    />
  );
}
