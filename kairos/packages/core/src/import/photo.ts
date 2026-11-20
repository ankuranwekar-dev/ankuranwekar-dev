/**
 * Reading a photograph of a phone showing a calendar.
 *
 * The native side recognises text and flattens images; everything else is here, so the same
 * code runs in the app, in tests and in the benchmark.
 */

import { readFlatCalendar, type CalendarReading, type FlatScene, type ReadOptions } from './calendar-image';
import { buildScene, fitPhotoGrid, planRectify, type PhotoOcr, type RectifyPlan } from './photo-grid';
import type { Pixels } from './png';

export type { PhotoOcr, OcrToken, RectifyPlan } from './photo-grid';

export interface PhotoDiagnostics {
  /** Where the attempt ended: no usable text, no calendar grid in the text, flattening failed, or read. */
  stage: 'no-text' | 'no-grid' | 'no-flatten' | 'read';
  /** Day numbers matched to the grid, and how closely (pixels, RMS) they sit on it. */
  numerals?: number;
  rms?: number;
  /** The photo's edge cuts through the calendar: some days are not in the picture. */
  cropped?: boolean;
}

export type PhotoReading = CalendarReading & { photo: PhotoDiagnostics };

/** A photograph that has been understood once and can be read again, e.g. as a different month. */
export interface PhotoSession {
  reading: PhotoReading;
  /** Read the same photograph again with different options (typically a corrected first month). */
  reread(options: ReadOptions): PhotoReading;
}

const failed = (stage: PhotoDiagnostics['stage'], extra: Partial<PhotoDiagnostics> = {}): PhotoReading => ({
  status: 'not-found',
  reason: 'no-grid',
  months: [],
  days: [],
  periods: [],
  predicted: [],
  confidence: 0,
  photo: { stage, ...extra },
});

/**
 * @param ocr      words recognised in the photograph, in the photograph's pixels
 * @param flatten  returns the photograph warped by `plan.homography` (output pixel to photo pixel) into
 *                 `plan.width` × `plan.height` pixels, or null when it cannot
 */
export async function startCalendarPhoto(
  ocr: PhotoOcr,
  flatten: (plan: RectifyPlan) => Promise<Pixels | null>,
  options: ReadOptions,
): Promise<PhotoSession> {
  const none = (r: PhotoReading): PhotoSession => ({ reading: r, reread: () => r });
  if (ocr.tokens.length < 8) return none(failed('no-text'));
  const fit = fitPhotoGrid(ocr);
  if (!fit) return none(failed('no-grid'));
  const plan = planRectify(fit, ocr);
  const flat = await flatten(plan);
  if (!flat) return none(failed('no-flatten', { numerals: fit.inliers, rms: fit.rms }));
  const scene: FlatScene = buildScene(ocr, fit, plan);
  const read = (o: ReadOptions): PhotoReading => ({
    ...readFlatCalendar(flat, scene, o),
    photo: { stage: 'read', numerals: fit.inliers, rms: fit.rms, cropped: plan.cropped },
  });
  return { reading: read(options), reread: read };
}

export async function readCalendarPhoto(
  ocr: PhotoOcr,
  flatten: (plan: RectifyPlan) => Promise<Pixels | null>,
  options: ReadOptions,
): Promise<PhotoReading> {
  return (await startCalendarPhoto(ocr, flatten, options)).reading;
}
