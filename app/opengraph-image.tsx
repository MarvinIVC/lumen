import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { APP_NAME } from '@/lib/config';
import { OG_IMAGE } from '@/lib/marketing/og';
import { light } from '@/lib/design/tokens';

/**
 * The share card.
 *
 * It lives at the app root so every route inherits it, and because the brief asks for one designed
 * static image rather than a generated one per page — generated cards for `/s/:id` shares are a
 * later phase, where there is a note title worth putting on them.
 *
 * Next prerenders this to a file at build time for statically rendered routes, so it costs nothing
 * at request time. The colours come from `lib/design/tokens` rather than being retyped: satori
 * cannot read CSS custom properties, and a share card drifting away from the product's palette is
 * the kind of thing nobody notices for a year.
 *
 * The card is in English on every locale. Rendering the Chinese headline would mean shipping a CJK
 * font to satori, and the smallest usable Noto Sans SC is several megabytes for the six words that
 * would fit here — a bad trade for a brand card whose largest element is a Latin-script wordmark.
 * TODO: revisit if a subset built from just these glyphs becomes part of the build.
 */
export const size = { width: OG_IMAGE.width, height: OG_IMAGE.height };
export const contentType = 'image/png';
export const alt = OG_IMAGE.alt;

const FONTS = join(process.cwd(), 'assets/og-fonts');

export default async function OpengraphImage() {
  const [serif, sans] = await Promise.all([
    readFile(join(FONTS, 'newsreader-600.ttf')),
    readFile(join(FONTS, 'inter-400.ttf')),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: light['--bg'],
        padding: '72px 80px',
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'Newsreader', fontSize: 40, color: light['--text'] }}>
          {APP_NAME}
        </span>
        <span style={{ fontFamily: 'Newsreader', fontSize: 40, color: light['--accent'] }}>.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontFamily: 'Newsreader',
            fontSize: 76,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            color: light['--text'],
            maxWidth: 940,
          }}
        >
          Turn your messy notes into a study guide you&apos;ll actually reread.
        </div>
      </div>

      {/*
          The hairline and the two labels are the whole illustration: the card says what the product
          does by showing its two states, which is the same argument the hero makes with an actual
          before and after. No stock imagery, no gradient — 03-DESIGN.md §1.
        */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', height: 1, background: light['--border-strong'] }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26 }}>
          <span style={{ color: light['--text-muted'] }}>Messy notes in</span>
          <span style={{ color: light['--text'] }}>Complete, correct, beautiful out</span>
          <span style={{ color: light['--accent'] }}>Free</span>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Newsreader', data: serif, weight: 600, style: 'normal' },
        { name: 'Inter', data: sans, weight: 400, style: 'normal' },
      ],
    },
  );
}
