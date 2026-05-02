import { useState, useEffect } from 'react';

const MOBILE_QUERY = '(max-width: 768px), (pointer: coarse)';

/** Simple query check — useful outside React components */
export function isMobileQuery(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** React hook that reactively tracks mobile viewport */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => isMobileQuery());

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
