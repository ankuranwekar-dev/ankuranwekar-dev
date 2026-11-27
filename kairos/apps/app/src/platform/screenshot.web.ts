import type { Pixels } from '@kairos/core';
import * as ImagePicker from 'expo-image-picker';

import { READ_WIDTH, type Picked } from './screenshot-shared';

export { deviceHints, type Picked } from './screenshot-shared';

export class CameraDenied extends Error {}

/** In the browser there is no camera path; the image never leaves the page. */
export async function pick(_source: 'library' | 'camera'): Promise<Picked | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, width: asset.width, height: asset.height, kind: 'screenshot' };
}

export async function pixelsOf(p: Picked): Promise<Pixels> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = p.uri;
  });
  const scale = img.naturalWidth > READ_WIDTH * 1.15 ? READ_WIDTH / img.naturalWidth : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
}
