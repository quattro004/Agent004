import { useState, useEffect, useRef } from 'react';
import {
  DEFAULT_AVATAR_THEME,
  getRandomTalkFrameIndex,
  getRandomTalkFrameIntervalMs,
  type AvatarTheme,
} from '../config/constants';

export type { AvatarTheme } from '../config/constants';

export type AvatarFrame = 'idle' | 'talk-1' | 'talk-2' | 'glitch' | 'blink' | 'laugh' | 'side-eye';

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
  /**
   * When true, runs a timed animation that alternates between talk-1 and talk-2
   * every randomized interval (200-300ms), overriding mouth-open detection.
   * Typically used during greeting playback.
   */
  talking?: boolean;
}

function useAvatarFrame({
  isMouthOpen,
  theme = DEFAULT_AVATAR_THEME,
  talking,
}: AvatarFrameCyclerProps) {
  const [isGlitching, setIsGlitching] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isLaughing, setIsLaughing] = useState(false);
  const [isSideEye, setIsSideEye] = useState(false);
  const [talkFrameIndex, setTalkFrameIndex] = useState(-1); // -1=unset, 0=talk-1, 1=talk-2
  const [isTalking, setIsTalking] = useState(false);
  const prevMouthOpenRef = useRef(false);

  // Timed talking animation during greeting: randomize between talk-1 and talk-2 every interval
  useEffect(() => {
    if (!talking) {
      setIsTalking(false);
      return;
    }

    setIsTalking(true);
    setTalkFrameIndex(getRandomTalkFrameIndex());
    const intervalId = setInterval(() => {
      setTalkFrameIndex(getRandomTalkFrameIndex());
    }, getRandomTalkFrameIntervalMs());

    return () => {
      clearInterval(intervalId);
    };
  }, [talking]);

  // Advance talk frames on each false→true mouth transition
  useEffect(() => {
    if (isMouthOpen && !prevMouthOpenRef.current) {
      setTalkFrameIndex(getRandomTalkFrameIndex());
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
  // For unset (-1), default to talk-1
  const talkFrames: AvatarFrame[] = ['talk-1', 'talk-2'];
  const talkFrame: AvatarFrame = talkFrameIndex < 0 ? 'talk-1' : talkFrames[talkFrameIndex];
  const frame: AvatarFrame = isGlitching
    ? 'glitch'
    : isBlinking
      ? 'blink'
      : isTalking || isMouthOpen
        ? talkFrame
        : isLaughing
          ? 'laugh'
          : isSideEye
            ? 'side-eye'
            : 'idle';

  return { src: `/avatar/${theme}/${frame}.png`, frame };
}

export function AvatarFrameCycler({
  isMouthOpen,
  theme,
  forceFrame,
  talking,
}: AvatarFrameCyclerProps) {
  const { src, frame } = useAvatarFrame({ isMouthOpen, theme, talking });
  const displayFrame = forceFrame ?? frame;
  const displaySrc = forceFrame
    ? `/avatar/${theme ?? DEFAULT_AVATAR_THEME}/${forceFrame}.png`
    : src;

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
