import type {
  CalloutBlock,
  Correction,
  DefinitionBlock,
  DiagramBlock,
  FactCheckFlag,
  FormulaBlock,
  GlossaryEntry,
  MarginNoteBlock,
  MisconceptionBlock,
  OpenQuestion,
  StructureBlock,
  TableBlock,
  WorkedExampleBlock,
} from '@/lib/ai/schema';

/**
 * Hand-written blocks for stories — the cases the gold fixture happens not to contain, plus
 * variants a single document could never show all of at once (all four callout kinds, all four
 * chart shapes, a misconception).
 *
 * Chemistry throughout, and correct chemistry: a story with plausible-looking nonsense in it
 * teaches the wrong lesson about what the renderer is for, and someone will screenshot it.
 */

export const sampleDefinition: DefinitionBlock = {
  type: 'definition',
  term: 'Formula unit',
  definition:
    'The smallest whole-number ratio of ions in an ionic compound. $\\ce{NaCl}$ names a ratio, not a molecule — there is no discrete particle of sodium chloride.',
  aliases: ['empirical unit'],
  origin: 'ai-added',
};

export const sampleFormula: FormulaBlock = {
  type: 'formula',
  latex: 'c = \\dfrac{n}{V}',
  number: '2.1',
  where: [
    { symbol: 'c', meaning: 'concentration', units: 'mol·dm⁻³' },
    { symbol: 'n', meaning: 'amount of solute', units: 'mol' },
    { symbol: 'V', meaning: 'volume of solution', units: 'dm³' },
  ],
  useWhen: 'you have a solution and need moles from a volume, or a volume from moles.',
  origin: 'student',
};

/** No `where` list and no "use when" — the panel should disappear rather than sit there empty. */
export const bareFormula: FormulaBlock = {
  type: 'formula',
  latex: '\\ce{2H2 + O2 ->[\\Delta] 2H2O}',
  where: [],
  useWhen: '',
  origin: 'student',
};

export const sampleWorkedExample: WorkedExampleBlock = {
  type: 'workedExample',
  problem:
    'What volume of $0.150\\ \\text{mol·dm}^{-3}$ $\\ce{NaOH}$ is needed to neutralise $25.0\\ \\text{cm}^3$ of $0.100\\ \\text{mol·dm}^{-3}$ $\\ce{H2SO4}$?',
  steps: [
    { text: 'Moles of acid', latex: 'n = cV = (0.100)(0.0250) = 2.50\\times10^{-3}\\ \\text{mol}' },
    {
      text: 'The equation is $\\ce{2NaOH + H2SO4 -> Na2SO4 + 2H2O}$, so 2 mol of base per mol of acid',
      latex: 'n(\\ce{NaOH}) = 2 \\times 2.50\\times10^{-3} = 5.00\\times10^{-3}\\ \\text{mol}',
    },
    { text: 'Volume of base', latex: 'V = \\dfrac{n}{c} = \\dfrac{5.00\\times10^{-3}}{0.150}' },
  ],
  answer: '33.3 cm³',
  answerLatex: 'V = 33.3\\ \\text{cm}^3',
  commonMistake:
    'Forgetting the 2:1 ratio and dividing straight across. Sulfuric acid is diprotic — the stoichiometry is the whole question.',
  origin: 'ai-added',
};

/** The same example, finishing the student's own half-done attempt. */
export const correctedWorkedExample: WorkedExampleBlock = {
  ...sampleWorkedExample,
  studentAttempt: {
    original: 'V = 16.7 cm³',
    issue:
      'You used a 1:1 ratio. $\\ce{H2SO4}$ is diprotic, so it takes twice as much $\\ce{NaOH}$ — $33.3\\ \\text{cm}^3$.',
  },
  origin: 'ai-corrected',
};

export const sampleCallouts: CalloutBlock[] = [
  {
    type: 'callout',
    kind: 'definition',
    title: 'Avogadro constant',
    text: 'The number of particles in one mole: $6.022\\times10^{23}\\ \\text{mol}^{-1}$.',
    origin: 'student',
  },
  {
    type: 'callout',
    kind: 'tip',
    text: 'Write the units into every line of working. Most sig-fig and conversion errors announce themselves the moment the units stop cancelling.',
    origin: 'ai-added',
  },
  {
    type: 'callout',
    kind: 'warning',
    text: 'Concentration is per **dm³**, not per cm³. A burette reading in cm³ has to be divided by 1000 before it goes anywhere near $c = n/V$.',
    origin: 'ai-added',
  },
  {
    type: 'callout',
    kind: 'example',
    title: 'Worth trying',
    text: 'Work out the molar mass of $\\ce{Ca(NO3)2}$ from the periodic table alone, then check it: 164.09 g·mol⁻¹.',
    origin: 'ai-added',
  },
];

export const sampleMisconception: MisconceptionBlock = {
  type: 'misconception',
  wrong: 'Heavier isotopes react more slowly, so isotopes of an element behave differently.',
  right:
    'Chemistry is set by electrons, and isotopes have the same electron configuration — so they are chemically almost identical. Mass affects rate only slightly, and mostly for hydrogen.',
  origin: 'ai-added',
};

export const sampleTable: TableBlock = {
  type: 'table',
  caption: 'The three subatomic particles, to the precision AP expects.',
  columns: [
    { header: 'Particle' },
    { header: 'Charge', numeric: true },
    { header: 'Relative mass', numeric: true },
    { header: 'Where' },
  ],
  rows: [
    ['Proton', '+1', '1', 'nucleus'],
    ['Neutron', '0', '1', 'nucleus'],
    ['Electron', '−1', '1/1836', 'orbitals'],
  ],
  origin: 'student',
};

export const sampleMarginNotes: MarginNoteBlock[] = [
  {
    type: 'marginNote',
    kind: 'mnemonic',
    text: '**OIL RIG** — Oxidation Is Loss, Reduction Is Gain. Of electrons, always.',
    origin: 'student',
  },
  {
    type: 'marginNote',
    kind: 'exam-tip',
    text: 'Examiners award the mark for the *ratio*, not the arithmetic. Show the mole ratio line even when you can do it in your head.',
    origin: 'ai-added',
  },
  {
    type: 'marginNote',
    kind: 'connection',
    text: 'This is the same reasoning as 1.1 — you are still converting along mass ↔ mole ↔ particles, just with two substances at once.',
    origin: 'ai-added',
  },
  {
    type: 'marginNote',
    kind: 'why-it-matters',
    text: 'Every titration calculation in Unit 4 is this, plus an indicator.',
    origin: 'ai-added',
  },
];

export const sampleMermaid: DiagramBlock = {
  type: 'diagram',
  engine: 'mermaid',
  source: `flowchart TD
  start["Mass of solute (g)"] --> moles["Moles (mol)"]
  moles --> conc["Concentration (mol/dm3)"]
  vol["Volume of solution (dm3)"] --> conc`,
  caption: 'Getting to a concentration from a mass and a volume.',
  alt: 'Flowchart: mass of solute leads to moles, which combines with volume of solution to give concentration.',
  origin: 'ai-added',
};

/** Deliberately broken — the renderer must drop it and keep the caption (06 §1). */
export const brokenMermaid: DiagramBlock = {
  type: 'diagram',
  engine: 'mermaid',
  source: 'gantt\n  title Not an allowed diagram type',
  caption: 'A diagram we could not draw keeps its caption and loses nothing else.',
  alt: 'Unsupported diagram.',
  origin: 'ai-added',
};

export const sampleStructure: StructureBlock = {
  type: 'structure',
  smiles: 'CC(=O)Oc1ccccc1C(=O)O',
  caption: 'Aspirin (acetylsalicylic acid), $\\ce{C9H8O4}$.',
  alt: 'Skeletal structure of aspirin: a benzene ring bearing a carboxylic acid and an ester group.',
  origin: 'ai-added',
};

export const sampleCorrections: Correction[] = [
  {
    sectionId: 's-1-1',
    original: 'A mole is 6.022 × 10²³ grams.',
    corrected: 'A mole is $6.022\\times10^{23}$ **particles** — it is a count, not a mass.',
    why: 'This is the single most common slip in Unit 1, and it makes every dimensional-analysis answer wrong by a factor of the molar mass.',
  },
  {
    sectionId: 's-1-2',
    original: 'Relative atomic mass = the average of the isotope masses.',
    corrected:
      'The **abundance-weighted** average. Averaging 34.969 and 36.966 directly gives 35.97; chlorine is 35.45.',
    why: '',
  },
];

export const sampleOpenQuestions: OpenQuestion[] = [
  {
    sectionId: 's-1-4',
    question:
      'Your notes stop after "titration curve —" with nothing following. We assumed a strong acid with a strong base.',
    why: 'Confirm which pair your class used; the shape of the curve and the choice of indicator both depend on it.',
  },
];

export const sampleFlags: FactCheckFlag[] = [
  {
    sectionId: 's-1-2',
    claim: 'The tallest peak in a mass spectrum is always the most abundant isotope.',
    issue:
      'True for a simple element spectrum, but not for molecules, where fragmentation can make a fragment peak the tallest.',
    confidence: 'medium',
  },
  {
    sectionId: 's-1-2',
    claim: 'z = 1 for every peak.',
    issue: 'Usually, but 2+ ions do appear. Your notes did not say which case this was.',
    confidence: 'low',
  },
];

export const sampleGlossary: GlossaryEntry[] = [
  {
    term: 'Mole',
    definition: 'An amount equal to $6.022\\times10^{23}$ items.',
    sectionId: 's-1-1',
  },
  {
    term: 'Molar mass ($M$)',
    definition: 'The mass of one mole of a substance, in g·mol⁻¹.',
    sectionId: 's-1-1',
  },
  {
    term: 'Isotopes',
    definition: 'Atoms of one element with different numbers of neutrons.',
    sectionId: 's-1-2',
  },
  {
    term: 'Formula unit',
    definition: 'The smallest whole-number ratio of ions in an ionic lattice.',
    sectionId: 's-1-3',
  },
];
