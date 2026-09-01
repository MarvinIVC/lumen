/**
 * The workspace routes (01-PRODUCT.md §1).
 *
 * A draft is addressed by `?d=<id>` rather than by a path segment or by a "current draft" key in
 * local storage. That is what makes the phase-03 requirement — refresh at any point and lose
 * nothing — hold without any extra machinery: the URL already says which draft this is, so the
 * back button, a second tab and a reload all do the obvious thing.
 */
export const APP_HOME = '/app';
export const APP_NEW = '/app/new';
export const APP_REVIEW = '/app/review';
export const APP_SETTINGS = '/app/settings';
export const APP_LIBRARY = '/app/library';

export const DRAFT_PARAM = 'd';

export function newHref(draftId?: string | null): string {
  return draftId ? `${APP_NEW}?${DRAFT_PARAM}=${draftId}` : APP_NEW;
}

export function reviewHref(draftId: string): string {
  return `${APP_REVIEW}?${DRAFT_PARAM}=${draftId}`;
}

export function noteHref(noteId: string): string {
  return `/app/note/${noteId}`;
}
