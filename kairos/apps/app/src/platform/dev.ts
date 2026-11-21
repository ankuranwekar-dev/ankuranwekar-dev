import { router } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect } from 'react';

/**
 * Developer check, compiled in only when EXPO_PUBLIC_DEV_READ=1 (never in a store build): the import screen can be
 * opened on a photo that was copied into the app's Documents/photos folder, with a chosen "today", so the real
 * screens can be looked at on a device without a second phone to photograph.
 */
export const DEV_READ = process.env.EXPO_PUBLIC_DEV_READ === '1';

export const devPhotoUri = (name: string) => new File(new Directory(Paths.document, 'photos'), name).uri;

/**
 * Developer check: in the simulator a link raises an "Open in Tender?" dialog that nothing can press without a person, so
 * the screens for the store listing are reached by writing a route into the app's Documents/dev-nav.txt instead: the
 * app goes there within a second and removes the file. Does nothing unless EXPO_PUBLIC_DEV_READ=1.
 */
export function useDevNav(): void {
  useEffect(() => {
    if (!DEV_READ) return;
    const file = new File(Paths.document, 'dev-nav.txt');
    let busy = false;
    const timer = setInterval(async () => {
      if (busy || !file.exists) return;
      busy = true;
      try {
        const to = (await file.text()).trim();
        file.delete();
        // "push:/route" opens it over the current screen (how a sheet is really seen); anything else replaces it.
        if (to.startsWith('push:')) router.push(to.slice(5) as never);
        else if (to) router.replace(to as never);
      } catch {
        // a half-written file: try again on the next tick
      } finally {
        busy = false;
      }
    }, 600);
    return () => clearInterval(timer);
  }, []);
}
