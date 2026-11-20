import { decodePng, type Pixels } from '@kairos/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { fromBase64, kindOf, READ_WIDTH, type Picked } from './screenshot-shared';

export { deviceHints, type Picked } from './screenshot-shared';

export class CameraDenied extends Error {
  constructor() {
    super('Camera access is off');
  }
}

/**
 * Lets her (or him) choose a picture, or take one, and says where it is. Everything is read on the phone and
 * never uploaded; the system photo picker needs no photo-library permission, and the camera asks once.
 */
export async function pick(source: 'library' | 'camera'): Promise<Picked | null> {
  let picked: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const allowed = await ImagePicker.requestCameraPermissionsAsync();
    if (!allowed.granted) throw new CameraDenied();
    picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  } else {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: true });
  }
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    kind: source === 'camera' ? 'photo' : kindOf(asset.exif, asset.width, asset.height),
  };
}

/** The picture shrunk to the shape reader's working width, as pixels. */
export async function pixelsOf(p: Picked): Promise<Pixels> {
  // Shrink natively and hand it over as PNG, which the engine can decode itself.
  const context = ImageManipulator.manipulate(p.uri);
  if (p.width > READ_WIDTH * 1.15) context.resize({ width: READ_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.PNG, base64: true });
  if (!saved.base64) throw new Error('Could not read that image');
  return decodePng(fromBase64(saved.base64));
}
