/**
 * Ambient declarations for the two side-effect imports the math loader makes.
 *
 * `katex/contrib/mhchem` ships no types (it registers `\ce{}` onto katex as a side effect and
 * exports nothing), and a CSS import has no module shape at all — it exists so the bundler emits
 * a stylesheet chunk alongside the katex chunk.
 */
declare module 'katex/contrib/mhchem';
declare module '*.css';
