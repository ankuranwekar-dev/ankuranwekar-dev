import { Directory, File, Paths } from 'expo-file-system';

/**
 * Developer check, compiled in only when EXPO_PUBLIC_DEV_READ=1 (never in a store build): the import screen can be
 * opened on a photo that was copied into the app's Documents/photos folder, with a chosen "today", so the real
 * screens can be looked at on a device without a second phone to photograph.
 */
export const DEV_READ = process.env.EXPO_PUBLIC_DEV_READ === '1';

export const devPhotoUri = (name: string) => new File(new Directory(Paths.document, 'photos'), name).uri;
