import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/** Set when the app is drawn inside the desktop website's phone frame. */
export const FrameContext = createContext<{ width: number; height: number } | null>(null);

/** Size of the screen the app is drawn on: the window, or the phone frame on the desktop website. */
export function useScreenSize() {
  const frame = useContext(FrameContext);
  const win = useWindowDimensions();
  return frame ?? win;
}

export function useInShowcase(): boolean {
  return useContext(FrameContext) !== null;
}
