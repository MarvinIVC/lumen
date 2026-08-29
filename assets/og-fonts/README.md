# Fonts for the Open Graph card

`app/opengraph-image.tsx` renders the share card with satori, which ships no system fonts and
cannot read a `woff2` — so the two faces it needs are checked in here as TrueType.

These files are **build-time only**. They are never served to a browser: the site's web fonts are
self-hosted by `next/font` from `lib/design/fonts.ts`, and this directory is outside `public/`.

| File                 | Family              | Source       | Licence                   |
| -------------------- | ------------------- | ------------ | ------------------------- |
| `newsreader-600.ttf` | Newsreader SemiBold | Google Fonts | SIL Open Font License 1.1 |
| `inter-400.ttf`      | Inter Regular       | Google Fonts | SIL Open Font License 1.1 |

Both licences permit redistribution of the font files, including bundled in a repository, provided
the fonts are not sold on their own and the OFL text travels with them:
<https://openfontlicense.org/open-font-license-official-text/>.

Re-download with the URL Google Fonts serves to a non-woff2 user agent:

```bash
curl -sSL "https://fonts.googleapis.com/css2?family=Newsreader:wght@600" -H "User-Agent: curl/7.0"
```
