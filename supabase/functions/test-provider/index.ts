/**
 * A scripted stand-in for DeepSeek, so the guardrails can be proved without spending anything.
 *
 * The three-layer cost ceiling (02-ARCHITECTURE.md §7) is the part of this product that must be
 * *demonstrably* true, and demonstrating it means driving the real `enhance` function — real auth,
 * real quota reads, real ledger writes, real SSE — until it refuses. Doing that against the live
 * provider would cost money on every CI run and would still not let us force a cap.
 *
 * So: an OpenAI-compatible streaming endpoint that lives inside the same edge runtime, reachable
 * at `http://kong:8000/functions/v1/test-provider`, and selected by pointing DEEPSEEK_BASE_URL at
 * it. The scenario comes from a marker in the prompt itself, because that is the one channel a
 * test controls end to end.
 *
 * It refuses to run unless ALLOW_TEST_PROVIDER is set, and the deploy workflow names the functions
 * it ships, so this cannot reach production by either route.
 */
const DOC = {
  title: 'Moles and Molar Mass',
  summary:
    'A short lesson on the mole as a count rather than a mass, and the conversions between grams, moles and particles that follow from it.',
  objectives: ['Convert between mass, moles and particles'],
  sections: [
    {
      id: 's-1',
      title: '1.1 The mole',
      level: 2,
      blocks: [
        { type: 'paragraph', origin: 'student', text: 'A mole is a count of particles.' },
        {
          type: 'formula',
          origin: 'ai-added',
          latex: 'n = m/M',
          useWhen: 'You have a mass and want moles.',
          where: [
            { symbol: 'n', meaning: 'amount of substance', units: 'mol' },
            { symbol: 'm', meaning: 'mass', units: 'g' },
            { symbol: 'M', meaning: 'molar mass', units: 'g mol^-1' },
          ],
        },
      ],
    },
    {
      id: 's-2',
      title: '1.2 Isotopes',
      level: 2,
      blocks: [
        { type: 'paragraph', origin: 'ai-added', text: 'Same protons, different neutrons.' },
      ],
    },
  ],
  corrections: [],
  openQuestions: [],
  factCheck: { calculationsVerified: [], checkedClaims: 1, flags: [] },
  studyTools: { flashcards: [], quiz: [] },
  glossary: [],
};

const VERIFY = { patches: [], calculations: [], flags: [], verdict: 'ok' };

const SCENARIOS: Record<string, string> = {
  ok: JSON.stringify(DOC),
  refusal: JSON.stringify({
    refused: { reason: 'This is an essay to rewrite, not a set of class notes.' },
  }),
  badjson: 'I had a think about it and here is my answer, unfenced and unparseable: {{{',
};

/** Present in the garbage itself, so a repair call carrying it back gets garbage again. */
const GARBAGE_SENTINEL = 'unfenced and unparseable';

function scenarioFrom(prompt: string): string {
  const marker = /\[\[TEST:([a-z]+)\]\]/.exec(prompt)?.[1] ?? 'ok';
  return SCENARIOS[marker] ?? SCENARIOS.ok!;
}

Deno.serve(async (request) => {
  if (!Deno.env.get('ALLOW_TEST_PROVIDER')) {
    return new Response('not available', { status: 404 });
  }
  if (!request.url.includes('/chat/completions')) {
    return new Response(JSON.stringify({ ok: true, note: 'scripted provider' }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = (await request.json()) as {
    messages?: { role: string; content: unknown }[];
    max_tokens?: number;
  };
  const prompt = JSON.stringify(body.messages ?? []);
  // The verify pass asks a different question; answering it with a document would be nonsense.
  // The unparseable scenario has to stay unparseable through the repair round trip as well, or it
  // would test the recovery rather than the failure — and the repair prompt quotes the garbage
  // back at us, which is how it recognises itself.
  const payload = prompt.includes('examiner checking a draft study guide')
    ? JSON.stringify(VERIFY)
    : prompt.includes(GARBAGE_SENTINEL)
      ? SCENARIOS.badjson!
      : scenarioFrom(prompt);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const frame = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      for (let i = 0; i < payload.length; i += 40) {
        frame({ choices: [{ delta: { content: payload.slice(i, i + 40) } }] });
      }
      frame({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 2000,
          completion_tokens: Math.ceil(payload.length / 4),
          // A cache hit on everything but the run instruction — the shape a second call for the
          // same course produces, so the ledger's two rates are both exercised.
          prompt_cache_hit_tokens: prompt.includes('SECOND CALL') ? 1600 : 0,
          prompt_cache_miss_tokens: prompt.includes('SECOND CALL') ? 400 : 2000,
        },
      });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });
});
