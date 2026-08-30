/**
 * The eval fixtures (04-AI-ENGINE.md §9).
 *
 * Each case is a real messy input, a short "what good looks like" note beside it in `fixtures/`,
 * and the assertions that make "good" machine-checkable. The universal rubric checks live in
 * `hard-checks.ts`; what is here is what is specific to *this lesson* — the C₅H₇N example being
 * finished, the diatomics mnemonic surviving verbatim, the Gatsby analysis quoting only what the
 * student wrote down.
 *
 * The set spans the six domain families deliberately, because the failure modes differ by family:
 * a Chemistry lesson fails by dropping units, a History lesson by inventing a historian, a
 * literature lesson by inventing a quotation, and an OCR case by writing over the gap where a page
 * could not be read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { allBlocks, check, documentText } from './hard-checks';
import type { CheckResult } from './hard-checks';
import type { EnhanceOptions, NoteContext, NoteDocument } from '@/lib/ai/schema';

const ROOT = resolve(import.meta.dirname, '../..');

export function fixture(name: string): string {
  return readFileSync(resolve(ROOT, 'fixtures', name), 'utf8');
}

export interface EvalCase {
  id: string;
  /** The raw notes, as they reach the enhance call. */
  raw: string;
  context: NoteContext;
  options: EnhanceOptions;
  /** True for the fixture that must be declined rather than rebuilt. */
  expectRefusal?: boolean;
  /** Skipped for a `tidy` run or a refusal — there is nothing to make study tools from. */
  expectStudyTools?: boolean;
  assertions: (doc: NoteDocument) => CheckResult[];
}

const COMPLETE: EnhanceOptions = {
  mode: 'complete',
  depth: 'match',
  visuals: 'auto',
  voice: 'keep-mine',
};

const has = (doc: NoteDocument, pattern: RegExp): boolean => pattern.test(documentText(doc));

const hasCorrection = (doc: NoteDocument, pattern: RegExp): boolean =>
  doc.corrections.some((correction) =>
    pattern.test(`${correction.original} ${correction.corrected} ${correction.why}`),
  );

const hasBlock = (doc: NoteDocument, type: string, pattern?: RegExp): boolean =>
  allBlocks(doc).some(
    ({ block }) => block.type === type && (!pattern || pattern.test(JSON.stringify(block))),
  );

export const CASES: EvalCase[] = [
  /* ---------------------------------------------------------------- AP Chem */
  {
    id: 'ap-chem-u1',
    raw: fixture('ap-chem-u1-raw.md'),
    context: {
      subject: 'Chemistry',
      curriculum: 'AP',
      course: 'AP Chemistry',
      unit: 'Unit 1 — Atomic Structure and Properties',
      topic: '1.1-1.4',
      language: 'en',
      domainFamily: 'stem-quantitative',
    },
    options: COMPLETE,
    expectStudyTools: true,
    assertions: (doc) => [
      // §9, and the phase's definition of done, line by line.
      check(
        'c5h7n-example-is-finished',
        has(doc, /C_?\{?10\}?H_?\{?14\}?N_?\{?2\}?|C10H14N2/i),
        'the cut-off empirical-formula example does not reach C10H14N2',
      ),
      check(
        'c5h7n-raises-an-open-question',
        doc.openQuestions.some((q) =>
          /C_?5|C5H7N|empirical|molecular formula/i.test(`${q.question} ${q.why}`),
        ),
        'the finished example is not offered back to the student to confirm against class',
      ),
      check(
        'atomic-mass-is-qualified',
        hasCorrection(doc, /atomic mass|molar mass/i) ||
          has(doc, /numerically equal[^.]*(?:different|not the same)/i),
        '"atomic mass = molar mass" is not distinguished by units',
      ),
      check(
        'amu-and-gmol-both-appear',
        has(doc, /\bamu\b|\bu\b/) && has(doc, /g\s*[·⋅]?\s*mol|g\/mol|g mol\^?-1|gmol/i),
        'the two units are never contrasted',
      ),
      check(
        'seven-diatomics-are-complete',
        ['hydrogen', 'nitrogen', 'fluorine', 'oxygen', 'iodine', 'chlorine', 'bromine'].every(
          (element) => new RegExp(element, 'i').test(documentText(doc)),
        ),
        'the seven diatomic elements are not all present',
      ),
      check(
        'mnemonic-is-preserved-verbatim',
        has(doc, /Have No Fear of Ice Cold Beer/),
        "the student's own mnemonic is missing or was reworded",
      ),
      check(
        'mnemonic-is-still-theirs',
        allBlocks(doc).some(
          ({ block }) =>
            block.type === 'marginNote' &&
            block.origin === 'student' &&
            /Have No Fear of Ice Cold Beer/.test(block.text),
        ),
        'the mnemonic is not a student-origin margin note',
      ),
      check(
        'mass-spectrum-figure-is-added',
        hasBlock(doc, 'diagram', /m\/z|mass spectrum|relative abundance/i),
        'no mass-spectrum figure',
      ),
      check(
        'mercury-example-is-verified',
        allBlocks(doc).some(({ block }) => {
          if (block.type !== 'workedExample') return false;
          const text = JSON.stringify(block);
          return (
            /mercury|Hg/i.test(text) &&
            /g\s*[·⋅]?\s*cm|cm\^?3|cm³/i.test(text) &&
            /1\.30|1\.3\s*×|1\.3\\times/i.test(text)
          );
        }),
        'the mercury worked example is missing, unitless, or does not reach ~1.30e24 atoms',
      ),
      check(
        'mercury-answer-is-boxed',
        allBlocks(doc).some(
          ({ block }) =>
            block.type === 'workedExample' &&
            /mercury|Hg/i.test(JSON.stringify(block)) &&
            Boolean(block.answer.trim()),
        ),
        'the mercury example has no stated final answer',
      ),
      check(
        'calculations-were-verified',
        doc.factCheck.calculationsVerified.length > 0,
        'factCheck.calculationsVerified is empty',
      ),
      check(
        'mole-map-is-added',
        hasBlock(doc, 'diagram', /mermaid|flowchart|graph/i) ||
          hasBlock(doc, 'diagram', /mole|particle/i),
        'no mass ↔ moles ↔ particles map',
      ),
    ],
  },

  /* -------------------------------------------------------------- Biology */
  {
    id: 'bio-transport',
    raw: fixture('bio-transport-raw.md'),
    context: {
      subject: 'Biology',
      curriculum: 'AP',
      course: 'AP Biology',
      unit: 'Cell Structure and Function',
      topic: 'membrane transport',
      language: 'en',
      domainFamily: 'stem-descriptive',
    },
    options: COMPLETE,
    expectStudyTools: true,
    assertions: (doc) => [
      check(
        'osmosis-direction-is-corrected',
        hasCorrection(doc, /osmosis|water potential/i),
        'the reversed osmosis definition was not corrected and logged',
      ),
      check(
        'osmosis-reads-high-to-low',
        has(doc, /high(?:er)?\s+water potential\s+to\s+low/i),
        'the corrected direction does not appear in the text',
      ),
      check(
        'pump-polarity-is-corrected',
        hasCorrection(doc, /sodium|potassium|pump|negative/i),
        'the "inside more positive" error was not corrected',
      ),
      check(
        'passive-vs-active-is-a-table',
        hasBlock(doc, 'table', /passive|active/i),
        'the comparison the notes started is not a table',
      ),
      check(
        'water-potential-is-a-three-part-formula',
        hasBlock(doc, 'formula', /kPa/i),
        'water potential has no formula block with units',
      ),
      check('has-a-process-diagram', hasBlock(doc, 'diagram'), 'no diagram at all'),
      check(
        'misconceptions-are-separate-from-corrections',
        hasBlock(doc, 'misconception'),
        'no misconception block',
      ),
    ],
  },

  /* -------------------------------------------------------------- History */
  {
    id: 'history-coldwar',
    raw: fixture('history-coldwar-raw.md'),
    context: {
      subject: 'History',
      curriculum: 'AP',
      course: 'AP US History',
      unit: 'Origins of the Cold War',
      topic: null,
      language: 'en',
      domainFamily: 'history-social',
    },
    options: COMPLETE,
    expectStudyTools: true,
    assertions: (doc) => [
      check(
        'truman-doctrine-date-is-corrected',
        hasCorrection(doc, /truman doctrine|1947/i),
        'the 1948 date was not corrected to 1947',
      ),
      check(
        'long-term-and-trigger-stay-separate',
        has(doc, /long[- ]term/i) && has(doc, /trigger|short[- ]term|immediate/i),
        'the causal separation the question turns on is gone',
      ),
      check(
        'historiography-is-a-table',
        hasBlock(doc, 'table', /orthodox|revisionist/i),
        'the three schools are not compared in a table',
      ),
      check(
        'has-a-timeline-or-causation-diagram',
        hasBlock(doc, 'diagram'),
        'no timeline or causation diagram',
      ),
      check(
        // Deliberately narrow. "The revisionist school argues that American policy…" is good
        // history writing; "according to Gaddis" is a name the student never gave us.
        'no-invented-historians',
        !/\baccording to\s+[A-Z][a-z]+|\bas\s+[A-Z][a-z]+\s+(?:wrote|argued|put it)\b/.test(
          documentText(doc),
        ),
        'a named historian appears that the student never mentioned',
      ),
    ],
  },

  /* ----------------------------------------------------------- Literature */
  {
    id: 'english-gatsby',
    raw: fixture('english-gatsby-raw.md'),
    context: {
      subject: 'English Literature',
      curriculum: 'AP',
      course: 'AP English Literature',
      unit: 'The Great Gatsby',
      topic: 'chapters 1-3',
      language: 'en',
      domainFamily: 'literature-language-arts',
    },
    options: COMPLETE,
    expectStudyTools: true,
    assertions: (doc) => [
      check(
        'devices-are-tied-to-the-students-quotations',
        has(doc, /Reserving judgments/) && has(doc, /came and went like moths/),
        "the analysis does not quote the student's own quotations",
      ),
      check(
        'the-paraphrase-stays-a-paraphrase',
        !/"[^"]*full of money[^"]*"/.test(documentText(doc)) ||
          has(doc, /paraphrase|check (?:this )?against the text|not (?:an )?exact/i),
        'an unsourced paraphrase is presented as an exact quotation',
      ),
      check(
        'no-page-or-line-references',
        !/\b(?:p\.|pp\.|line|ll\.)\s*\d+/i.test(documentText(doc)),
        'a page or line reference was invented',
      ),
      check(
        'east-and-west-egg-are-compared',
        hasBlock(doc, 'table', /egg/i),
        'the old-money / new-money contrast is not a table',
      ),
      check(
        'devices-are-defined',
        hasBlock(doc, 'definition', /unreliable narrator|simile|symbol|imagery/i),
        'the terms of art are not defined',
      ),
    ],
  },

  /* -------------------------------------------------------------- Chinese */
  {
    id: 'chinese-poetry',
    raw: fixture('chinese-poetry-raw.md'),
    context: {
      subject: 'Chinese Literature',
      curriculum: 'INTERNAL',
      course: '语文',
      unit: '唐诗',
      topic: '静夜思',
      language: 'zh',
      domainFamily: 'literature-language-arts',
    },
    options: COMPLETE,
    expectStudyTools: true,
    assertions: (doc) => [
      check(
        'output-is-in-chinese',
        (documentText(doc).match(/[一-鿿]/g) ?? []).length > 200,
        'the note came back in English for a Chinese lesson (rubric item 13)',
      ),
      check(
        'dynasty-error-is-corrected',
        hasCorrection(doc, /唐|宋|dynasty/i),
        'Li Bai is still a Song poet',
      ),
      check(
        'the-poem-itself-is-preserved',
        has(doc, /床前明月光/) && has(doc, /低头思故乡/),
        'the poem the lesson is about is missing',
      ),
      check(
        'english-glosses-survive',
        has(doc, /homesick|moon|frost/i),
        "the student's own English glosses were translated away",
      ),
    ],
  },

  /* ------------------------------------------------------------ OCR / gap */
  {
    id: 'photo-ocr',
    raw: fixture('photo-ocr-raw.md'),
    context: {
      subject: 'Physics',
      curriculum: 'A_LEVEL',
      course: 'A-Level Physics',
      unit: 'Waves',
      topic: null,
      language: 'en',
      domainFamily: 'stem-quantitative',
    },
    options: COMPLETE,
    expectStudyTools: true,
    assertions: (doc) => [
      check(
        'the-unread-page-is-raised-as-a-question',
        doc.openQuestions.some((q) =>
          /could not be read|unread|photograph|page|image/i.test(`${q.question} ${q.why}`),
        ),
        'the page that could not be read is not mentioned anywhere',
      ),
      check(
        'nothing-is-invented-across-the-gap',
        !/\[IMAGE/i.test(documentText(doc)),
        'the image placeholder leaked into the finished note',
      ),
      check(
        'wave-equation-is-three-part',
        hasBlock(doc, 'formula', /Hz|m\s*s\^?-1|ms\^\{-1\}/i),
        'v = fλ has no units on its symbols',
      ),
      check(
        'transverse-vs-longitudinal-is-compared',
        hasBlock(doc, 'table', /transverse|longitudinal/i),
        'the two wave types are not compared',
      ),
    ],
  },

  /* ------------------------------------------------------ Errors riddled */
  {
    id: 'errors-riddled',
    raw: fixture('errors-riddled-raw.md'),
    context: {
      subject: 'Chemistry',
      curriculum: 'IGCSE',
      course: 'IGCSE Chemistry',
      unit: 'Acids and Bases',
      topic: null,
      language: 'en',
      domainFamily: 'stem-quantitative',
    },
    options: COMPLETE,
    expectStudyTools: true,
    assertions: (doc) => [
      check(
        'at-least-four-errors-are-logged',
        doc.corrections.length >= 4,
        `${doc.corrections.length} correction(s) for five planted errors`,
      ),
      check(
        'strong-vs-concentrated-is-corrected',
        hasCorrection(doc, /strong|concentrat/i),
        'the strong-versus-concentrated confusion is not corrected',
      ),
      check(
        'ph-definition-is-corrected',
        hasCorrection(doc, /pH|H3O|hydrogen ion|OH/i),
        'pH = -log[OH-] stands',
      ),
      check(
        'the-arithmetic-is-fixed',
        has(doc, /58\.5/) && has(doc, /14\.6/),
        'M(NaCl) = 58.5 and the 14.6 g answer do not both appear',
      ),
      check(
        'catalyst-equilibrium-claim-is-corrected',
        hasCorrection(doc, /catalyst|equilibrium/i),
        'the catalyst-shifts-equilibrium error stands',
      ),
      check(
        'every-correction-says-why',
        doc.corrections.every((correction) => correction.why.trim().length > 0),
        'a correction was logged with no explanation',
      ),
      check(
        'the-tone-is-not-a-scold',
        !/\byou (?:were|are) wrong\b|\bincorrect(?:ly)?\b.*\byou\b/i.test(documentText(doc)),
        'the corrections read as a telling-off (06 §5 item 6)',
      ),
    ],
  },

  /* --------------------------------------------------------------- Refusal */
  {
    id: 'essay-rewrite',
    raw: fixture('essay-rewrite-raw.md'),
    context: {
      subject: 'English',
      curriculum: 'UNKNOWN',
      course: '',
      unit: null,
      topic: null,
      language: 'en',
      domainFamily: 'literature-language-arts',
    },
    options: COMPLETE,
    expectRefusal: true,
    assertions: () => [],
  },
];

export function caseById(id: string): EvalCase {
  const found = CASES.find((entry) => entry.id === id);
  if (!found) throw new Error(`No eval case '${id}'`);
  return found;
}
