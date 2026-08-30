/**
 * Token estimation, deliberately crude.
 *
 * Everything that needs an exact count — the ledger, the cost, the guardrails — reads the number
 * the provider reports. This is for the two places where an estimate is the right tool: keeping
 * the curriculum pack block inside its ~1200-token budget (05-CURRICULUM-PACKS.md §2), and showing
 * a student roughly how large their notes are before they spend a credit.
 *
 * ~4 characters per token holds for English prose and code; CJK is nearer 1.5, and a mixed
 * document lands in between, so the CJK-aware split below is worth its four lines.
 */
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/g;

export function approxTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}
