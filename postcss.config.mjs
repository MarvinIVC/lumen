/**
 * Object form rather than the array shorthand: Next accepts both, but Storybook's Vite builder
 * only normalises the object form (SB_FRAMEWORK_NEXTJS_0003).
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
