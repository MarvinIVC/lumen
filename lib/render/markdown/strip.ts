/**
 * Strips the inline syntax — for alt text, `<title>` elements and the outline rail.
 *
 * It lives in its own module, apart from the renderer in `inline.tsx`, because it has no
 * dependencies and its callers should not acquire any. A server component that only needs plain
 * text — the landing page's static note opening, for instance — would otherwise pull `InlineMath`
 * and the maths loader into its module graph to use seven regular expressions.
 */
export function stripInline(text: string): string {
  return text
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/\*([^*]+?)\*/g, '$1')
    .replace(/_([^_]+?)_/g, '$1')
    .replace(/\[([^\]]+?)\]\([^)\s]+\)/g, '$1')
    .replace(/\$([^$]+?)\$/g, '$1')
    .trim();
}
