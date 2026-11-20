import {
  startCalendarPhoto,
  type OcrToken,
  type PhotoSession,
  type ReadOptions,
} from '@kairos/core';
import { requireOptionalNativeModule } from 'expo';


interface TenderVision {
  recognize(uri: string, maxEdge: number): Promise<{ width: number; height: number; turns: number; tokens: OcrToken[] }>;
  rectify(uri: string, maxEdge: number, turns: number, h: number[], width: number, height: number): Promise<Uint8Array>;
}

/** The iOS text recogniser; absent on Android and the web, where only flat screenshots can be read. */
const native = requireOptionalNativeModule<TenderVision>('TenderVision');

/** Milliseconds spent in each stage of the latest photo, for the developer check. */
export const timings: { recognize?: number; flatten?: number; total?: number } = {};

export const photoReaderAvailable = native != null;

/** Long edge, in pixels, that a photograph is read at: sharp enough for small numerals, small enough to be quick. */
const MAX_EDGE = 2600;

/**
 * Finds the calendar in a photograph (or any picture), straightens it and reads it. Text recognition and the
 * warp run natively on the phone; nothing is sent anywhere.
 */
export async function startPhoto(uri: string, options: ReadOptions): Promise<PhotoSession> {
  if (!native) throw new Error('Photo reading is not available here');
  const t0 = Date.now();
  const ocr = await native.recognize(uri, MAX_EDGE);
  timings.recognize = Date.now() - t0;
  const session = await startCalendarPhoto(
    ocr,
    async (plan) => {
      try {
        const t = Date.now();
        const data = await native.rectify(uri, MAX_EDGE, ocr.turns, plan.homography, plan.width, plan.height);
        timings.flatten = Date.now() - t;
        return data.length === plan.width * plan.height * 4 ? { width: plan.width, height: plan.height, data } : null;
      } catch {
        return null;
      }
    },
    options,
  );
  timings.total = Date.now() - t0;
  return session;
}
