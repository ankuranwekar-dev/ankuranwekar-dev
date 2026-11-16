import type { Pixels } from '@kairos/core';
import * as ImagePicker from 'expo-image-picker';

import { READ_WIDTH } from './screenshot-shared';

export { deviceHints } from './screenshot-shared';

/** In the browser the canvas hands over pixels directly; the image never leaves the page. */
export async function pickScreenshot(): Promise<Pixels | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = asset.uri;
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
