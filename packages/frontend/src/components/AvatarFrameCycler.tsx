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
}

function useAvatarFrame({ isMouthOpen, theme = 'retro' }: AvatarFrameCyclerProps) {
  const [isGlitching, setIsGlitching] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
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

  // Recursive blink timer: blink every 4–6s for 150ms
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 4000 + Math.random() * 2000;
      timeoutId = setTimeout(() => {
        setIsBlinking(true);
        timeoutId = setTimeout(() => {
          setIsBlinking(false);
          schedule();
        }, 150);
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
        : 'idle';

  return { src: `/avatar/${theme}/${frame}.png`, frame };
}

export function AvatarFrameCycler({ isMouthOpen, theme }: AvatarFrameCyclerProps) {
  const { src, frame } = useAvatarFrame({ isMouthOpen, theme });

  return (
    <img
      src={src}
      alt=""
      data-testid="avatar-frame"
      data-frame={frame}
      className="avatar-frame-cycler"
    />
  );
}
