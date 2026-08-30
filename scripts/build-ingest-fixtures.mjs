#!/usr/bin/env node
/**
 * Builds the two binary fixtures phase-03's definition of done names:
 *
 *   fixtures/ap-chem-u1-raw.docx   the canonical messy notes, as Word actually stores them
 *   fixtures/scanned-worksheet.pdf a two-page PDF with images and no text layer
 *
 *   pnpm fixtures:ingest
 *
 * Both are generated rather than hand-made so that the .docx is provably the *same notes* as
 * `ap-chem-u1-raw.md` — `tests/unit/ingest-fixtures.test.ts` asserts that, which is what makes
 * "upload the real fixture as .txt and as .docx and compare" a meaningful check rather than two
 * unrelated files that happen to be nearby.
 *
 * Neither needs a library. A .docx is a zip of four small XML parts, and a PDF page holding one
 * Flate-compressed RGB image is about thirty lines — pulling in `docx` (phase-06's exporter) or a
 * PDF writer to produce two test files would put a build dependency in the tree for no reason.
 */
import { createHash } from 'node:crypto';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const fixtures = join(root, 'fixtures');

/* -------------------------------------------------------------------------- *
 * A minimal zip writer (deflate, no directories, no zip64).
 * -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, contents] of entries) {
    const data = Buffer.from(contents, 'utf8');
    const deflated = deflateRawSync(data);
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date — a fixed one, so the file is byte-stable
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuffer, deflated);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(deflated.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBuffer);

    offset += local.length + nameBuffer.length + deflated.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/* -------------------------------------------------------------------------- *
 * Markdown → WordprocessingML
 * -------------------------------------------------------------------------- */

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paragraph(text, { style, numbered } = {}) {
  const properties = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    numbered ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '',
  ].join('');
  const runs = escape(text)
    .split('\n')
    .map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${line}</w:t>`)
    .join('');
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}<w:r>${runs}</w:r></w:p>`;
}

/** The same segmentation Word would have produced from someone typing these notes. */
function markdownToParagraphs(markdown) {
  const body = markdown.replace(/<!--[\s\S]*?-->/g, '').trim();
  const out = [];

  for (const line of body.split('\n')) {
    const text = line.trim();
    if (!text) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(text);
    if (heading) {
      out.push(paragraph(heading[2], { style: `Heading${heading[1].length}` }));
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(text);
    if (bullet) {
      out.push(paragraph(bullet[1], { style: 'ListParagraph', numbered: true }));
      continue;
    }
    out.push(paragraph(text));
  }
  return out;
}

async function buildDocx() {
  const markdown = await readFile(join(fixtures, 'ap-chem-u1-raw.md'), 'utf8');
  const paragraphs = markdownToParagraphs(markdown).join('');

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;

  // Mammoth reads heading levels off the style id, and list structure off numbering.xml. Without
  // the numbering part every bullet arrives as a bare paragraph and the fixture stops being a
  // fair test of "structure recognizable".
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    [1, 2, 3]
      .map(
        (level) =>
          `<w:style w:type="paragraph" w:styleId="Heading${level}">` +
          `<w:name w:val="heading ${level}"/></w:style>`,
      )
      .join('') +
    `<w:style w:type="paragraph" w:styleId="ListParagraph">` +
    `<w:name w:val="List Paragraph"/></w:style></w:styles>`;

  const numbering =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0">` +
    `<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
    `</Relationships>`;

  const buffer = zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['word/document.xml', document],
    ['word/_rels/document.xml.rels', documentRels],
    ['word/styles.xml', styles],
    ['word/numbering.xml', numbering],
  ]);

  await writeFile(join(fixtures, 'ap-chem-u1-raw.docx'), buffer);
  return buffer.length;
}

/* -------------------------------------------------------------------------- *
 * A scanned-looking PDF: images, no text layer.
 * -------------------------------------------------------------------------- */

/**
 * Draws grey "handwriting" onto an RGB bitmap. It has to *look* like a scan in the review pane —
 * a blank rectangle would prove the thumbnail pipeline works while telling a reader nothing.
 */
function scanBitmap(width, height, seed) {
  const pixels = Buffer.alloc(width * height * 3, 0xf4);
  let random = seed;
  const next = () => {
    random = (random * 1103515245 + 12345) % 2147483648;
    return random / 2147483648;
  };

  const paint = (x, y, ink) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = (y * width + x) * 3;
    pixels[at] = ink;
    pixels[at + 1] = ink;
    pixels[at + 2] = ink;
  };

  for (let line = 0; line < 14; line += 1) {
    const y = 40 + line * 26;
    let x = 34;
    const end = width - 40 - Math.floor(next() * 120);
    while (x < end) {
      const wordLength = 12 + Math.floor(next() * 46);
      for (let i = 0; i < wordLength && x < end; i += 1, x += 1) {
        const wobble = Math.round(Math.sin((x + line * 7) / 3.5) * 3);
        for (let thickness = 0; thickness < 2; thickness += 1) {
          paint(x, y + wobble + thickness, 0x33);
        }
      }
      x += 8 + Math.floor(next() * 10);
    }
  }
  return pixels;
}

/* -------------------------------------------------------------------------- *
 * PDF standard security (revision 2, 40-bit RC4).
 *
 * Needed so that "this PDF is locked" is a state the suite can actually walk rather than one we
 * assert about from the outside. A student being handed a locked past paper by their teacher is
 * an ordinary Tuesday, and the review screen's password dialog is otherwise untested code.
 *
 * RC4 is written out here because Node's crypto dropped it years ago, and rightly — this is a
 * deliberately weak, forty-bit, twenty-year-old scheme, used to produce a test fixture and for
 * nothing else. It encrypts nothing that matters and is never used to protect anything.
 * -------------------------------------------------------------------------- */

const PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function rc4(key, data) {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n += 1) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

const md5 = (buffer) => createHash('md5').update(buffer).digest();

/** Pads or truncates a password to the 32 bytes the algorithm wants. */
function padPassword(password) {
  const bytes = Buffer.from(password, 'latin1');
  return Buffer.concat([bytes, PAD]).subarray(0, 32);
}

function standardSecurity({ userPassword, ownerPassword, permissions, id }) {
  const ownerKey = md5(padPassword(ownerPassword)).subarray(0, 5);
  const o = rc4(ownerKey, padPassword(userPassword));

  const p = Buffer.alloc(4);
  p.writeInt32LE(permissions, 0);
  const key = md5(Buffer.concat([padPassword(userPassword), o, p, id])).subarray(0, 5);
  const u = rc4(key, PAD);

  return {
    key,
    dict:
      `<< /Filter /Standard /V 1 /R 2 /Length 40 ` +
      `/O <${o.toString('hex')}> /U <${u.toString('hex')}> /P ${permissions} >>`,
  };
}

/** Per-object key: the file key plus the object and generation numbers, MD5'd. */
function objectKey(fileKey, objectNumber) {
  const extra = Buffer.from([
    objectNumber & 0xff,
    (objectNumber >> 8) & 0xff,
    (objectNumber >> 16) & 0xff,
    0,
    0,
  ]);
  return md5(Buffer.concat([fileKey, extra])).subarray(0, Math.min(16, fileKey.length + 5));
}

async function buildScannedPdf({
  name = 'scanned-worksheet.pdf',
  width = 460,
  height = 620,
  pageCount = 2,
  encrypt = null,
} = {}) {
  /** Object bodies, 0-indexed; object numbers are index + 1. `binaries` holds the stream bytes. */
  const objects = [];
  const binaries = new Map();
  const reserve = () => objects.push(null);

  const imageIds = [];
  const contentIds = [];
  const pageIds = [];
  for (let page = 0; page < pageCount; page += 1) imageIds.push(reserve());
  for (let page = 0; page < pageCount; page += 1) contentIds.push(reserve());
  for (let page = 0; page < pageCount; page += 1) pageIds.push(reserve());
  const pagesId = reserve();
  const catalogId = reserve();
  const encryptId = encrypt ? reserve() : null;

  // A fixed file id, so the fixture is byte-stable across builds. It is an input to the key.
  const fileId = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const security = encrypt
    ? standardSecurity({
        userPassword: encrypt.userPassword,
        ownerPassword: encrypt.ownerPassword ?? `${encrypt.userPassword}-owner`,
        // -4 leaves every permission bit off except the reserved high ones: view only.
        permissions: -4,
        id: fileId,
      })
    : null;
  if (encryptId) objects[encryptId - 1] = security.dict;

  for (let page = 0; page < pageCount; page += 1) {
    const raw = deflateSync(scanBitmap(width, height, 7 + page * 31));
    binaries.set(imageIds[page], raw);
    objects[imageIds[page] - 1] =
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${raw.length} >>`;

    const stream = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    objects[contentIds[page] - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

    objects[pageIds[page] - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /XObject << /Im0 ${imageIds[page]} 0 R >> >> ` +
      `/Contents ${contentIds[page]} 0 R >>`;
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary')];
  const offsets = [];
  let cursor = chunks[0].length;

  objects.forEach((body, index) => {
    offsets.push(cursor);
    const number = index + 1;
    const raw = binaries.get(number);

    // Every stream is encrypted with its own key. The /Encrypt dictionary itself is not.
    const stream =
      security && raw && number !== encryptId ? rc4(objectKey(security.key, number), raw) : raw;

    let text = body;
    if (security && !raw && number !== encryptId) {
      // The only other stream in this file is the page content, which is inline in the body.
      const match = /stream\n([\s\S]*?)\nendstream/.exec(body);
      if (match) {
        const encrypted = rc4(objectKey(security.key, number), Buffer.from(match[1], 'latin1'));
        text = body
          .replace(/\/Length \d+/, `/Length ${encrypted.length}`)
          .replace(match[1], encrypted.toString('latin1'));
      }
    }

    const buffer = stream
      ? Buffer.concat([
          Buffer.from(`${number} 0 obj\n${text}\nstream\n`, 'binary'),
          stream,
          Buffer.from('\nendstream\nendobj\n', 'binary'),
        ])
      : Buffer.from(`${number} 0 obj\n${text}\nendobj\n`, 'binary');
    chunks.push(buffer);
    cursor += buffer.length;
  });

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const idHex = fileId.toString('hex');
  xref +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R ` +
    (encryptId ? `/Encrypt ${encryptId} 0 R ` : '') +
    `/ID [<${idHex}> <${idHex}>] >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'binary'));

  const buffer = Buffer.concat(chunks);
  await writeFile(join(fixtures, name), buffer);
  return buffer.length;
}

/** The password the locked fixture opens with. Also hardcoded in the end-to-end suite. */
export const LOCKED_PDF_PASSWORD = 'unit-1';

const built = [
  ['ap-chem-u1-raw.docx', await buildDocx()],
  ['scanned-worksheet.pdf', await buildScannedPdf()],

  // The caps from 02-ARCHITECTURE.md §7. Tiny pages: these exist to be counted, not to be read,
  // and 61 legible pages would be a megabyte of fixture for a number.
  [
    'long-scan-45p.pdf',
    await buildScannedPdf({ name: 'long-scan-45p.pdf', width: 120, height: 160, pageCount: 45 }),
  ],
  [
    'too-many-pages-61p.pdf',
    await buildScannedPdf({
      name: 'too-many-pages-61p.pdf',
      width: 120,
      height: 160,
      pageCount: 61,
    }),
  ],

  // 01-PRODUCT.md §5: "Password-protected PDF — ask for the password client-side".
  [
    'locked-worksheet.pdf',
    await buildScannedPdf({
      name: 'locked-worksheet.pdf',
      width: 240,
      height: 320,
      pageCount: 1,
      encrypt: { userPassword: LOCKED_PDF_PASSWORD },
    }),
  ],
];

for (const [name, size] of built) {
  console.log(`fixtures/${name.padEnd(24)} ${(size / 1024).toFixed(1)} KB`);
}
