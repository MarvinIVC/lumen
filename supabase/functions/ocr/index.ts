/**
 * ocr — vision OCR for photographed and scanned pages (02-ARCHITECTURE.md §2).
 *
 * Stub: returns 501 until phase-03 implements it.
 */
import { notImplemented, serve } from '../_shared/response.ts';

const TODO =
  'Accept page images, call deepseek-vision-exp with a gemini-2.5-flash fallback, return text plus per-page confidence for the review screen. Counts against the ocr quota.';

serve((request) => notImplemented(request, 'ocr', TODO, 'phase-03'));
