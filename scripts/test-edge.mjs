#!/usr/bin/env node
/**
 * Integration tests for the edge functions, against a real local Supabase.
 *
 *   pnpm db:start                                   # once
 *   pnpm exec supabase db reset
 *   pnpm exec supabase functions serve --no-verify-jwt --env-file supabase/functions/.env.test &
 *   pnpm test:edge
 *
 * These are the tests that cannot be written anywhere else. The pipeline is unit tested against a
 * mock provider and the router's state machine is a pure function, but "the cost ceiling is
 * enforced in code" (02-ARCHITECTURE.md §1) is a claim about auth, Postgres, a streaming response
 * and a ledger write all agreeing — and the only way to check that is to drive the deployed shape
 * of the thing until it refuses.
 *
 * The provider is `supabase/functions/test-provider`, selected with DEEPSEEK_BASE_URL. Nothing
 * here spends a cent, and the same script runs in CI.
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const BASE = process.env.EDGE_BASE_URL ?? 'http://127.0.0.1:54321/functions/v1';
const ENC_KEY = process.env.BYOK_ENC_KEY ?? 'Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyMTIzNDU2Nzg=';

const CONTEXT = {
  subject: 'Chemistry',
  curriculum: 'AP',
  course: 'AP Chemistry',
  unit: 'Unit 1',
  topic: '1.1',
  language: 'en',
};

let failures = 0;
const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures += 1;
}

function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      'supabase_db_lumen',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

function setConfig(key, value) {
  sql(`update app_config set value = '${value}'::jsonb where key = '${key}'`);
}

/** The same envelope `_shared/crypto.ts` writes: v1.<base64 iv>.<base64 ciphertext+tag>. */
function sealKey(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENC_KEY, 'base64'), iv);
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `v1.${iv.toString('base64')}.${body.toString('base64')}`;
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { response, text };
}

/** Reads an SSE body into `{ event: [payloads] }`. */
function parseSse(text) {
  const events = {};
  for (const frame of text.split('\n\n')) {
    const name = /^event: (.+)$/m.exec(frame)?.[1];
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n');
    if (!name) continue;
    (events[name] ??= []).push(data ? JSON.parse(data) : null);
  }
  return events;
}

async function enhance(extract, extra = {}, headers = {}) {
  const { response, text } = await post(
    'enhance',
    { extract, context: CONTEXT, ...extra },
    headers,
  );
  return { response, events: parseSse(text), text };
}

/* -------------------------------------------------------------------------- */

async function testHappyPath() {
  const { response, events } = await enhance('A mole is an amount. [[TEST:ok]]');
  check('happy path streams', response.ok && events.document?.length === 1);
  check('happy path reveals sections before the document', events.section?.length === 2);
  check(
    'happy path charges one credit',
    events.usage?.[0]?.credits === 1,
    JSON.stringify(events.usage?.[0]),
  );
  check(
    'happy path writes the ledger',
    Number(sql("select count(*) from usage_event where kind = 'enhance' and credits = 1")) >= 1,
  );
  check('happy path issues a signed anon id', Boolean(response.headers.get('x-lumen-anon-id')));
  return response.headers.get('x-lumen-anon-id');
}

async function testAnonReplay(anonId) {
  const { response } = await enhance(
    'Second lesson. [[TEST:ok]]',
    {},
    { 'x-lumen-anon-id': anonId },
  );
  check('a replayed anon id is not reissued', !response.headers.get('x-lumen-anon-id'));
  const rows = sql(`select count(*) from usage_event where anon_id = '${anonId}'`);
  check('a replayed anon id keeps the same quota key', Number(rows) >= 2, `rows=${rows}`);
}

async function testForgedAnonId() {
  const { response } = await enhance(
    'Forged. [[TEST:ok]]',
    {},
    { 'x-lumen-anon-id': 'a1.abc.123.deadbeef' },
  );
  // A forged id is not an error — it is simply not accepted, and a fresh one is issued instead.
  check(
    'a forged anon id is replaced, not trusted',
    Boolean(response.headers.get('x-lumen-anon-id')),
  );
}

async function testCacheHitPricing() {
  sql('delete from usage_event');
  await enhance('First. [[TEST:ok]]');
  await enhance('SECOND CALL for the same course. [[TEST:ok]]');
  const cached = sql('select cached_tokens_in from usage_event order by id desc limit 1');
  const first = sql('select cached_tokens_in from usage_event order by id asc limit 1');
  check(
    'a cache hit is recorded on the second call',
    Number(cached) > 0 && Number(first) === 0,
    `first=${first} second=${cached}`,
  );
  const costs = sql('select cost_cny from usage_event order by id asc').split('\n').map(Number);
  check('a cache hit is cheaper', costs[1] < costs[0], costs.join(' vs '));
}

async function testRefusal() {
  sql('delete from usage_event');
  const { events } = await enhance('Rewrite my essay please. [[TEST:refusal]]');
  check('a refusal says why', typeof events.refused?.[0]?.reason === 'string');
  check(
    'a refusal charges no credit',
    Number(sql('select credits from usage_event order by id desc limit 1')) === 0,
  );
  check(
    'a refusal still records its cost',
    Number(sql('select cost_cny from usage_event order by id desc limit 1')) > 0,
  );
}

async function testUnparseable() {
  sql('delete from usage_event');
  const { events } = await enhance('Broken. [[TEST:badjson]]');
  // §8: repair, then a tidy retry, then an error the student can act on — never a crash and never
  // a charge. The scripted provider stays broken through all three.
  check(
    'unparseable output tries to repair itself',
    events.status?.some((s) => s.phase === 'repairing'),
  );
  check(
    'unparseable output falls back to tidy',
    events.status?.some((s) => s.phase === 'simplifying'),
  );
  check(
    'unparseable output ends in a resumable error',
    events.error?.[0]?.code === 'unparseable' && events.error?.[0]?.resumable === true,
  );
  check(
    'unparseable output charges no credit',
    Number(sql('select credits from usage_event order by id desc limit 1')) === 0,
  );
  check(
    'unparseable output still records what it spent',
    Number(sql('select cost_cny from usage_event order by id desc limit 1')) > 0,
  );
}

async function testQuota() {
  sql('delete from usage_event');
  setConfig(
    'quota',
    '{"anon":{"enhance_per_day":1,"ocr_per_day":1},"verified":{"enhance_per_day":20,"ocr_per_day":20},"byok":{"enhance_per_day":1000}}',
  );
  const first = await enhance('One. [[TEST:ok]]');
  const anonId = first.response.headers.get('x-lumen-anon-id');
  const { response, text } = await post(
    'enhance',
    { extract: 'Two. [[TEST:ok]]', context: CONTEXT },
    { 'x-lumen-anon-id': anonId },
  );
  const body = JSON.parse(text);
  check(
    'the second call over quota is refused',
    response.status === 429 && body.error === 'quota',
    text.slice(0, 120),
  );
  check('a quota refusal says when it resets', typeof body.resetsAt === 'string');
  check('a quota refusal points at BYOK', body.byokHelps === true);
}

async function testDailyCapAndByok() {
  setConfig(
    'quota',
    '{"anon":{"enhance_per_day":50,"ocr_per_day":50},"verified":{"enhance_per_day":20,"ocr_per_day":20},"byok":{"enhance_per_day":1000}}',
  );
  setConfig('daily_cap_cny', '0.001');
  const { response, text } = await post('enhance', {
    extract: 'Capped. [[TEST:ok]]',
    context: CONTEXT,
  });
  const body = JSON.parse(text);
  check(
    'the community cap refuses shared calls',
    response.status === 429 && body.error === 'daily-cap',
    text.slice(0, 120),
  );

  const byok = { provider: 'deepseek', model: 'deepseek-v4-flash', ciphertext: sealKey('sk-test') };
  const withKey = await enhance('Capped but mine. [[TEST:ok]]', { byok });
  check('BYOK is unaffected by the cap', withKey.events.document?.length === 1);
  check(
    'BYOK costs the community nothing',
    Number(sql('select cost_cny from usage_event where byok order by id desc limit 1')) === 0,
  );
  setConfig('daily_cap_cny', '6');
}

async function testKillSwitch() {
  setConfig('enhance_enabled', 'false');
  const { response, text } = await post('enhance', {
    extract: 'Off. [[TEST:ok]]',
    context: CONTEXT,
  });
  check(
    'the kill switch stops shared calls',
    response.status === 503 && JSON.parse(text).error === 'kill-switch',
    text.slice(0, 120),
  );
  setConfig('enhance_enabled', 'true');
}

async function testUsageEndpoint() {
  sql('delete from usage_event');
  const first = await enhance('Meter. [[TEST:ok]]');
  const anonId = first.response.headers.get('x-lumen-anon-id');
  const response = await fetch(`${BASE}/usage`, { headers: { 'x-lumen-anon-id': anonId } });
  const body = await response.json();
  check('the meter reflects real spending', body.enhance.used === 1, JSON.stringify(body));
  check('the meter knows the tier total', body.enhance.total > 0);
  check('the meter says when it resets', typeof body.enhance.resetsAt === 'string');
}

async function testByokSealing() {
  const { response, text } = await post('byok', {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    apiKey: 'sk-a-students-own-key',
  });
  const body = JSON.parse(text);
  check(
    'a valid key is sealed',
    response.ok && typeof body.ciphertext === 'string',
    text.slice(0, 120),
  );
  check('the key is never echoed back', !text.includes('sk-a-students-own-key'));
  const reuse = await enhance('With my own key. [[TEST:ok]]', {
    byok: { provider: 'deepseek', model: 'deepseek-v4-flash', ciphertext: body.ciphertext },
  });
  check('the sealed key can be used', reuse.events.document?.length === 1);
}

async function testCors() {
  // ALLOWED_ORIGINS is unset here, which is the local-development case: any origin is echoed back.
  // The allowlist matching itself is a pure function and is unit tested in tests/unit/cors.test.ts
  // — the Supabase CLI does not pick up a newly added env key without restarting the whole stack,
  // so asserting it here would be asserting the harness rather than the code.
  const response = await fetch(`${BASE}/usage`, {
    method: 'OPTIONS',
    headers: { origin: 'https://pr-7-lumen.example.workers.dev' },
  });
  check('preflight is answered', response.status === 204 || response.ok, String(response.status));
  check(
    'the anon id header is exposed to the client',
    (response.headers.get('access-control-expose-headers') ?? '').includes('x-lumen-anon-id'),
    response.headers.get('access-control-expose-headers') ?? 'none',
  );
  check(
    'the anon id header is allowed on the request',
    (response.headers.get('access-control-allow-headers') ?? '').includes('x-lumen-anon-id'),
  );
}

async function testInputCap() {
  const { response, text } = await post('enhance', {
    extract: 'x'.repeat(60_001),
    context: CONTEXT,
  });
  check('oversized notes are refused before any call', response.status === 413, text.slice(0, 80));
}

/* -------------------------------------------------------------------------- */

async function main() {
  sql('delete from usage_event');
  sql('delete from daily_cost');

  const anonId = await testHappyPath();
  await testAnonReplay(anonId);
  await testForgedAnonId();
  await testCacheHitPricing();
  await testRefusal();
  await testUnparseable();
  await testInputCap();
  await testCors();
  await testQuota();
  await testDailyCapAndByok();
  await testUsageEndpoint();
  await testByokSealing();
  await testKillSwitch();

  for (const { name, ok, detail } of results) {
    console.log(
      `${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`,
    );
  }
  console.log(`\n${results.length - failures}/${results.length} edge checks passed.`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
