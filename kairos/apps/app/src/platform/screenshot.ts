import { decodePng, type Pixels } from '@kairos/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { READ_WIDTH } from './screenshot-shared';

export { deviceHints } from './screenshot-shared';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]!;
    const b = LOOKUP[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)]! : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/**
 * Lets her (or him) choose a screenshot and returns its pixels. The image is
 * read on the phone and never uploaded; the system photo picker needs no
 * photo-library permission.
 */
export async function pickScreenshot(): Promise<Pixels | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  // Shrink natively to the reader's working width and hand it over as PNG, which the engine can decode itself.
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > READ_WIDTH * 1.15) context.resize({ width: READ_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.PNG, base64: true });
  if (!saved.base64) throw new Error('Could not read that image');
  return decodePng(fromBase64(saved.base64));
}
