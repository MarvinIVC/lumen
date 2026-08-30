/**
 * Stage A detection (04-AI-ENGINE.md §3) — local heuristics first, the model only when unsure.
 *
 * The point is to avoid spending a model call on the common case: most notes announce their
 * subject, curriculum, and unit in the first two lines. The AP Chemistry fixture opens with
 * "# AP Chem Unit 1", and everything on the review screen can be filled from that without a
 * single token of spend.
 *
 * Everything here is pure and synchronous, so it runs on mount with no loading state, and so the
 * unit suite can hold it to the fixture's expected answer.
 */
import { detectLanguage } from './language';
import type { Curriculum, DetectionResult, DomainFamily } from '@/lib/ai/schema';

export interface HeuristicDetection {
  subject: string | null;
  curriculum: Curriculum;
  /** "AP Chemistry". Composed from curriculum + subject when the notes do not name it. */
  course: string | null;
  unit: string | null;
  topic: string | null;
  language: string;
  /** 0–1. Below 0.7, or when `isStudyNotes` is unclear, the model runs (§3). */
  confidence: number;
  isStudyNotes: boolean | null;
}

/**
 * Keyword tables per subject. Deliberately terms a student writes, not terms a syllabus uses:
 * these are matched against handwriting transcriptions and half-finished bullet points.
 */
export const SUBJECT_KEYWORDS: Record<string, string[]> = {
  Chemistry: [
    'mole',
    'molar mass',
    'isotope',
    'stoichiometry',
    'oxidation',
    'covalent',
    'ionic',
    'electronegativity',
    'enthalpy',
    'titration',
    'equilibrium',
    'ph',
    'avogadro',
    'atomic mass',
    'valence',
    'orbital',
    'photoelectron',
    'reagent',
    'aqueous',
    'periodic table',
  ],
  Physics: [
    'velocity',
    'acceleration',
    'momentum',
    'newton',
    'kinematic',
    'friction',
    'circuit',
    'voltage',
    'capacitor',
    'wavelength',
    'refraction',
    'torque',
    'joule',
    'kinetic energy',
    'free body',
    'magnetic field',
  ],
  Biology: [
    'mitosis',
    'meiosis',
    'enzyme',
    'photosynthesis',
    'chromosome',
    'allele',
    'ribosome',
    'membrane',
    'homeostasis',
    'natural selection',
    'genotype',
    'atp',
    'osmosis',
    'protein synthesis',
  ],
  Mathematics: [
    'derivative',
    'integral',
    'theorem',
    'polynomial',
    'asymptote',
    'sine',
    'cosine',
    'matrix',
    'vector',
    'probability',
    'quadratic',
    'logarithm',
    'limit as',
    'proof',
  ],
  'Computer Science': [
    'algorithm',
    'array',
    'recursion',
    'boolean',
    'compiler',
    'big o',
    'data structure',
    'binary search',
    'inheritance',
    'runtime',
    'pseudocode',
  ],
  Economics: [
    'supply and demand',
    'elasticity',
    'opportunity cost',
    'gdp',
    'inflation',
    'monopoly',
    'marginal cost',
    'fiscal policy',
    'aggregate demand',
    'externality',
  ],
  History: [
    'treaty',
    'revolution',
    'empire',
    'dynasty',
    'colonial',
    'war of',
    'reform',
    'nationalism',
    'primary source',
    'historiography',
    'century',
  ],
  Geography: [
    'erosion',
    'tectonic',
    'urbanisation',
    'urbanization',
    'climate',
    'migration',
    'biome',
    'sediment',
    'population density',
    'monsoon',
  ],
  Psychology: [
    'cognitive',
    'conditioning',
    'neuron',
    'stimulus',
    'behaviourism',
    'behaviorism',
    'attachment',
    'perception',
    'schema',
    'reinforcement',
  ],
  'English Literature': [
    'metaphor',
    'protagonist',
    'imagery',
    'stanza',
    'soliloquy',
    'narrator',
    'motif',
    'foreshadowing',
    'thesis statement',
    'iambic',
  ],
  Business: [
    'stakeholder',
    'break-even',
    'cash flow',
    'marketing mix',
    'swot',
    'profit margin',
    'economies of scale',
    'supply chain',
  ],
};

/**
 * Phrases that give away a curriculum. Short and specific: "CED" and "FRQ" belong to the College
 * Board and nothing else, "command term" and "Paper 1" to the IB, "mark scheme" to the British
 * boards. A subject word would be useless here — every curriculum teaches chemistry.
 */
export const CURRICULUM_PHRASES: Record<Curriculum, string[]> = {
  AP: ['ap ', 'college board', 'ced', 'frq', 'mcq section', 'ap exam', 'advanced placement'],
  IB_HL: ['ib hl', 'higher level', 'hl only', 'ahl'],
  IB_SL: ['ib sl', 'standard level', 'sl only'],
  A_LEVEL: ['a-level', 'a level', 'as level', 'edexcel', 'ocr', 'aqa', 'specification point'],
  IGCSE: ['igcse', 'gcse', 'cambridge igcse', 'cie '],
  INTERNAL: ['honors', 'honours', 'school exam', 'midterm', 'unit test'],
  GENERAL: [],
  UNKNOWN: [],
};

/** Phrases shared by the whole IB, used to fall back to IB when neither level is stated. */
const IB_PHRASES = [
  'international baccalaureate',
  'command term',
  ' ia ',
  'internal assessment',
  'paper 1',
  'paper 2',
  'tok',
  'extended essay',
  'sub-topic',
];

/** `Unit 3`, `Topic 4`, `Chapter 2`, `第三章`, IB `Sub-topic 2.1`. */
export const UNIT_PATTERNS: RegExp[] = [
  /\bunit\s*(\d+[a-z]?)\b/i,
  /\btopic\s*(\d+(?:\.\d+)?)\b/i,
  /\bchapter\s*(\d+)\b/i,
  /\bmodule\s*(\d+)\b/i,
  /\bsub-?topic\s*(\d+\.\d+)\b/i,
  /第\s*([0-9一二三四五六七八九十]+)\s*[章单單]/,
];

/** Subject → the DOMAIN_TEMPLATE_BLOCK family (04-AI-ENGINE.md §4.3). */
const DOMAIN_FAMILIES: Record<string, DomainFamily> = {
  Chemistry: 'stem-quantitative',
  Physics: 'stem-quantitative',
  Mathematics: 'stem-quantitative',
  Economics: 'stem-quantitative',
  'Computer Science': 'stem-quantitative',
  Biology: 'stem-descriptive',
  Geography: 'stem-descriptive',
  Psychology: 'stem-descriptive',
  History: 'history-social',
  Business: 'history-social',
  'English Literature': 'literature-language-arts',
};

export { detectLanguage } from './language';

export function domainFamilyFor(subject: string, _curriculum: Curriculum): DomainFamily {
  return DOMAIN_FAMILIES[subject] ?? 'generic';
}

/** The words a course is usually called, given what we worked out. */
export function courseNameFor(subject: string | null, curriculum: Curriculum): string | null {
  if (!subject) return null;
  switch (curriculum) {
    case 'AP':
      return `AP ${subject}`;
    case 'IB_HL':
      return `IB ${subject} HL`;
    case 'IB_SL':
      return `IB ${subject} SL`;
    case 'A_LEVEL':
      return `A-Level ${subject}`;
    case 'IGCSE':
      return `IGCSE ${subject}`;
    default:
      return subject;
  }
}

interface SubjectScore {
  subject: string;
  hits: number;
}

function scoreSubjects(haystack: string): SubjectScore[] {
  return Object.entries(SUBJECT_KEYWORDS)
    .map(([subject, keywords]) => ({
      subject,
      hits: keywords.reduce(
        (total, keyword) => (haystack.includes(keyword) ? total + 1 : total),
        0,
      ),
    }))
    .filter((score) => score.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

function scoreCurriculum(haystack: string): { curriculum: Curriculum; hits: number } {
  let best: { curriculum: Curriculum; hits: number } = { curriculum: 'UNKNOWN', hits: 0 };
  for (const [curriculum, phrases] of Object.entries(CURRICULUM_PHRASES) as [
    Curriculum,
    string[],
  ][]) {
    const hits = phrases.reduce(
      (total, phrase) => (haystack.includes(phrase) ? total + 1 : total),
      0,
    );
    if (hits > best.hits) best = { curriculum, hits };
  }
  if (best.curriculum === 'UNKNOWN') {
    const ibHits = IB_PHRASES.reduce(
      (total, phrase) => (haystack.includes(phrase) ? total + 1 : total),
      0,
    );
    // The IB without a stated level: SL is the larger cohort, and the review screen asks anyway.
    if (ibHits >= 2) return { curriculum: 'IB_SL', hits: ibHits };
  }
  return best;
}

/** "Unit 1" plus whatever named it, so the field reads "Unit 1 — Atomic Structure". */
function findUnit(text: string): { unit: string | null; topic: string | null } {
  const lines = text.split('\n').slice(0, 40);
  for (const line of lines) {
    for (const pattern of UNIT_PATTERNS) {
      const match = pattern.exec(line);
      if (!match) continue;
      const label = match[0].trim();
      // Whatever named the unit, up to the first sentence break. A heading line is short; a line
      // of prose that happens to say "chapter 2" is not, and its tail is not a unit name.
      const remainder = (
        line
          .slice((match.index ?? 0) + match[0].length)
          .replace(/^[\s—–:.\-|)]+/, '')
          .replace(/^#+\s*/, '')
          .split(/[."”'’,;(]/)[0] ?? ''
      )
        .trim()
        .slice(0, 60)
        .trim();
      const unit = remainder ? `${capitalise(label)} — ${remainder}` : capitalise(label);
      return { unit, topic: remainder || null };
    }
  }
  return { unit: null, topic: null };
}

function capitalise(value: string): string {
  return value.replace(/^\w/, (character) => character.toUpperCase());
}

/**
 * The local pass. Reads the head of the extract for the announcement and the whole thing for the
 * vocabulary, because a title says what a course is and the body says what a subject is.
 */
export function detectLocally(extract: string): HeuristicDetection {
  const head = extract.slice(0, 1500);
  const haystack = ` ${extract.slice(0, 20_000).toLowerCase().replace(/\s+/g, ' ')} `;

  const subjects = scoreSubjects(haystack);
  const best = subjects[0];
  const runnerUp = subjects[1];
  const subject = best && best.hits >= 2 ? best.subject : null;

  const curriculumScore = scoreCurriculum(haystack);
  const { unit, topic } = findUnit(head);
  const { language, confidence: languageConfidence } = detectLanguage(extract);

  // Three independent things have to be right for the pack to match and the vocabulary to fit, so
  // confidence is their product rather than the best of them.
  const subjectConfidence = !best
    ? 0
    : Math.min(0.95, 0.35 + best.hits * 0.12 - (runnerUp ? runnerUp.hits * 0.05 : 0));
  const curriculumConfidence =
    curriculumScore.curriculum === 'UNKNOWN'
      ? 0.3
      : Math.min(0.95, 0.5 + curriculumScore.hits * 0.2);

  const confidence = Number(
    (subjectConfidence * 0.55 + curriculumConfidence * 0.3 + languageConfidence * 0.15).toFixed(3),
  );

  return {
    subject,
    curriculum: curriculumScore.curriculum,
    course: courseNameFor(subject, curriculumScore.curriculum),
    unit,
    topic,
    language: language === 'und' ? 'en' : language,
    confidence,
    // The local pass can say "this is clearly notes"; it cannot responsibly say the opposite.
    // `assessQuality` in lib/ingest owns the soft warning, and the server owns the refusal.
    isStudyNotes: unit !== null || subject !== null ? true : null,
  };
}

/** True when the local pass is confident enough to skip the model (04-AI-ENGINE.md §3). */
export function isConfident(detection: HeuristicDetection): boolean {
  return detection.confidence >= 0.7 && detection.isStudyNotes !== null;
}

/** Merges the local heuristics with the model's answer, preferring the model where it disagrees. */
export function mergeDetection(
  local: HeuristicDetection,
  model: DetectionResult | null,
): DetectionResult {
  const subject = model?.subject || local.subject || '';
  const curriculum = model?.curriculum ?? local.curriculum;
  return {
    subject,
    curriculum,
    course: model?.course || local.course || courseNameFor(subject || null, curriculum) || '',
    unit: model?.unit ?? local.unit,
    topic: model?.topic ?? local.topic,
    language: model?.language || local.language,
    isStudyNotes: model?.isStudyNotes ?? local.isStudyNotes ?? true,
    confidence: model?.confidence ?? local.confidence,
    notes: model?.notes ?? '',
  };
}
