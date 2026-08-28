/**
 * notion-push — pushes a finished NoteDocument into the student's Notion workspace.
 *
 * Stub: returns 501 until phase-07 implements it.
 */
import { notImplemented, serve } from '../_shared/response.ts';

const TODO =
  'Decrypt the stored token, map the NoteDocument blocks to Notion blocks (math to equation blocks, callouts to callouts), create or update the page under the course mapping in integration.meta.';

serve((request) => notImplemented(request, 'notion-push', TODO, 'phase-07'));
