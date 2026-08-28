import { describe, expect, it } from 'vitest';

import { goldFixture } from '@/lib/render/fixture/gold';
import { stripInline } from '@/lib/render/markdown/inline';
import type { Block, BlockType } from '@/lib/ai/schema';

/**
 * The gold fixture is the renderer's proof (phase-01 DoD): if it does not survive the round trip
 * from markdown into a NoteDocument, nothing downstream is being judged against real content.
 *
 * These assertions are about *coverage and fidelity*, not exact strings — the fixture is prose and
 * will be edited. What must not silently regress is that every designed block type still appears,
 * that the provenance the fixture annotates still arrives as `origin`, and that the appendices are
 * whole.
 */

const doc = goldFixture();
const blocks: Block[] = doc.sections.flatMap((section) => section.blocks);
const types = new Set<BlockType>(blocks.map((block) => block.type));

describe('document', () => {
  it('reads the title and the one-paragraph summary', () => {
    expect(doc.title).toContain('Atomic Structure');
    expect(doc.summary).toContain('mole');
    expect(doc.summary.length).toBeGreaterThan(200);
  });

  it('keeps all four learning objectives', () => {
    expect(doc.objectives).toHaveLength(4);
    expect(doc.objectives[0]).toContain('dimensional analysis');
  });

  it('splits into the four topics plus their worked examples', () => {
    const topics = doc.sections.filter((section) => section.level === 2);
    expect(topics.map((section) => section.title.slice(0, 3))).toEqual([
      '1.1',
      '1.2',
      '1.3',
      '1.4',
    ]);
    expect(doc.sections.filter((s) => /^Worked example/.test(s.title))).toHaveLength(4);
  });

  it('gives every section a unique id for the outline and for deep links', () => {
    const ids = doc.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
  });
});

describe('blocks', () => {
  it('exercises every designed block type the fixture contains', () => {
    // Deliberately not `misconception` or `figure`: the gold fixture has neither, and asserting
    // they appear would mean the adapter had invented them.
    for (const type of [
      'paragraph',
      'list',
      'definition',
      'formula',
      'workedExample',
      'diagram',
      'structure',
      'callout',
      'table',
      'marginNote',
    ] satisfies BlockType[]) {
      expect(types, type).toContain(type);
    }
  });

  it('gives every formula its variables and their units (rubric item 2)', () => {
    const formulas = blocks.filter((block) => block.type === 'formula' && block.where.length > 0);
    expect(formulas.length).toBeGreaterThanOrEqual(2);
    for (const formula of formulas) {
      if (formula.type !== 'formula') continue;
      for (const variable of formula.where) {
        expect(variable.units, `${formula.latex} · ${variable.symbol}`).not.toBe('');
      }
      expect(formula.useWhen).not.toBe('');
    }
  });

  it('keeps chemistry markup intact for mhchem', () => {
    const source = JSON.stringify(doc);
    expect(source).toContain('\\ce{Hg}');
    expect(source).toContain('\\ce{C10H14N2}');
  });

  it('carries a themable Mermaid diagram and a captioned chart', () => {
    const diagrams = blocks.filter((block) => block.type === 'diagram');
    const mermaid = diagrams.find(
      (block) => block.type === 'diagram' && block.engine === 'mermaid',
    );
    const chart = diagrams.find((block) => block.type === 'diagram' && block.engine === 'chart');

    expect(mermaid?.type === 'diagram' && mermaid.source).toContain('flowchart');
    expect(chart?.type === 'diagram' && chart.spec?.kind).toBe('bars');
    // A caption cut off mid-clause is the failure mode this parser had; hold the line.
    for (const diagram of diagrams) {
      if (diagram.type !== 'diagram') continue;
      expect(diagram.alt.length, diagram.alt).toBeGreaterThan(20);
      expect(diagram.caption.trim(), diagram.caption).toMatch(/[.)\]]$/);
    }
  });

  it('preserves the provenance the fixture annotates in prose', () => {
    expect(doc.stats?.aiAdded).toBeGreaterThan(0);
    expect(doc.stats?.aiCorrected).toBeGreaterThan(0);
    expect(blocks.some((block) => block.origin === 'ai-clarified')).toBe(true);
  });

  it("attaches the student's own struck-through attempt to the example it belongs to", () => {
    const example = blocks.find(
      (block) => block.type === 'workedExample' && block.studentAttempt !== undefined,
    );
    expect(example?.type === 'workedExample' && example.studentAttempt?.original).toContain('1.3');
    expect(example?.type === 'workedExample' && example.answerLatex).toContain('1.31');
    expect(example?.type === 'workedExample' && example.studentAttempt?.issue).not.toBe('');
  });

  it('keeps the mnemonic as the student wrote it', () => {
    const mnemonic = blocks.find(
      (block) => block.type === 'marginNote' && block.kind === 'mnemonic',
    );
    expect(mnemonic?.type === 'marginNote' && mnemonic.text).toContain(
      'Have No Fear Of Ice Cold Beer',
    );
    // It is the student's own, and it stays theirs.
    expect(mnemonic?.origin).toBe('student');
  });
});

describe('appendices', () => {
  it('collects all four corrections, split into what was written and what it should say', () => {
    expect(doc.corrections).toHaveLength(4);
    for (const correction of doc.corrections) {
      expect(correction.original).not.toBe('');
      expect(correction.corrected).not.toBe('');
      // No stray markdown emphasis or severity tags leaking into the panel.
      expect(correction.corrected).not.toMatch(/\*\(|\*\*/);
    }
    expect(doc.corrections[0]?.why).toContain('AP explicitly tests');
  });

  it('splits each open question into the situation and the action', () => {
    expect(doc.openQuestions).toHaveLength(2);
    for (const question of doc.openQuestions) {
      expect(question.question).not.toBe('');
      expect(question.why).toMatch(/Confirm|Check/);
      // Sentences must not be cut where the source line happened to wrap.
      expect(stripInline(question.question)).toMatch(/[.)"”]$/);
    }
  });

  it('places corrections and open questions in the section they are about', () => {
    expect(doc.corrections[0]?.sectionId).toContain('1-1');
    expect(doc.openQuestions[1]?.sectionId).toContain('1-4');
  });

  it('collects the glossary, the study tools and what to study next', () => {
    expect(doc.glossary.length).toBeGreaterThanOrEqual(12);
    expect(doc.glossary.every((entry) => entry.term && entry.definition)).toBe(true);
    expect(doc.studyTools.flashcards).toHaveLength(5);
    expect(doc.studyTools.quiz).toHaveLength(3);
    expect(doc.furtherStudy).toHaveLength(3);
  });

  it('flags the illustrative figure as something to double-check', () => {
    expect(doc.factCheck.flags).toHaveLength(1);
    expect(doc.factCheck.flags[0]?.sectionId).not.toBe('');
    expect(doc.factCheck.flags[0]?.issue).toContain('illustrative');
  });
});
