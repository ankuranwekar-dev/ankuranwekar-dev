import type { ReactNode } from 'react';

/** On phones and tablets the app is the whole screen. The desktop website shell lives in showcase.web.tsx. */
export function Showcase({ children }: { children: ReactNode }) {
  return children;
}
