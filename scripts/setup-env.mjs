#!/usr/bin/env node
/**
 * Interactive setup for the keys the AI engine needs.
 *
 *   pnpm setup:env            # fill in what is missing
 *   pnpm setup:env --all      # re-ask for everything, including what is already set
 *   pnpm setup:env --github   # also push the values to GitHub Actions
 *
 * It exists because the alternative is a page of prose telling someone to paste eight values into
 * a dotfile they have to find first, and because two of those values are supposed to be random —
 * a human choosing them by hand is the one way that goes wrong.
 *
 * Nothing here leaves the machine except the `gh` calls at the end, which are opt-in, printed
 * before they run, and go only to this repository. Secrets are never echoed back, never logged,
 * and never written anywhere but `.env.local`, which is gitignored.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env.local');
const examplePath = resolve(root, '.env.example');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

const args = process.argv.slice(2);
const askAll = args.includes('--all');
const doGithub = args.includes('--github');

/* -------------------------------------------------------------------------- *
 * What we need, where it comes from, and what a valid one looks like.
 * -------------------------------------------------------------------------- */

/** The `iss` claim of a Supabase JWT, or null for anything that is not one. */
function issuerOf(token) {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.iss === 'string' ? json.iss : null;
  } catch {
    return null;
  }
}

const FIELDS = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    label: 'Supabase project URL',
    where: 'Supabase dashboard → Settings → API → Project URL',
    example: 'https://abcdefghijkl.supabase.co',
    // The local default counts as "not set yet": it is what .env.example ships.
    stale: (value) => value.includes('127.0.0.1') || value.includes('localhost'),
    validate: (value) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(value.trim())
        ? null
        : 'That should look like https://<project-ref>.supabase.co',
    clean: (value) => value.trim().replace(/\/$/, ''),
    github: 'variable',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    label: 'Supabase anon / publishable key',
    where: 'Supabase dashboard → Settings → API → anon public (or Publishable key)',
    secret: false,
    // `.env.example` ships the local stack's key, which is identical on every machine and is a
    // demo credential rather than a secret — its own payload says `iss: supabase-demo`. Without
    // this it looks "already set", the prompt is skipped, and every answer after it lands in the
    // wrong field.
    stale: (value) => issuerOf(value) === 'supabase-demo',
    validate: (value) => (value.length >= 20 ? null : 'That looks too short to be the anon key.'),
    github: 'variable',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    label: 'Supabase service-role / secret key',
    where: 'Supabase dashboard → Settings → API → service_role (reveal it first)',
    secret: true,
    validate: (value) => (value.length >= 20 ? null : 'That looks too short to be the secret key.'),
  },
  {
    key: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek API key',
    where: 'platform.deepseek.com → API keys. It needs prepaid balance to answer.',
    secret: true,
    validate: (value) =>
      value.startsWith('sk-') ? null : 'DeepSeek keys start with sk- — check you copied all of it.',
    github: 'secret',
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Google Gemini API key',
    where: 'aistudio.google.com/apikey — the free tier is enough',
    secret: true,
    validate: (value) => (value.length >= 20 ? null : 'That looks too short to be a Gemini key.'),
    github: 'secret',
  },
  {
    key: 'SUPABASE_ACCESS_TOKEN',
    label: 'Supabase personal access token',
    where: 'supabase.com/dashboard/account/tokens → Generate new token',
    secret: true,
    deployOnly: true,
    validate: (value) => (value.length >= 20 ? null : 'That looks too short to be a token.'),
    github: 'secret',
  },
  {
    key: 'SUPABASE_DB_PASSWORD',
    label: 'Supabase database password',
    where: 'The one you chose when you created the project',
    secret: true,
    deployOnly: true,
    validate: (value) => (value.length >= 6 ? null : 'That looks too short.'),
    github: 'secret',
  },
];

/** Made here rather than asked for: a human-chosen random key is not a random key. */
const GENERATED = [
  {
    key: 'BYOK_ENC_KEY',
    label: 'BYOK encryption key',
    generate: () => randomBytes(32).toString('base64'),
    github: 'secret',
  },
  {
    key: 'ANON_ID_SECRET',
    label: 'Anonymous-id signing secret',
    generate: () => randomBytes(32).toString('base64'),
    github: 'secret',
  },
];

/* -------------------------------------------------------------------------- *
 * Reading and writing .env.local without disturbing anything else in it
 * -------------------------------------------------------------------------- */

function readEnv() {
  if (!existsSync(envPath)) {
    if (!existsSync(examplePath)) throw new Error('Neither .env.local nor .env.example exists.');
    writeFileSync(envPath, readFileSync(examplePath, 'utf8'));
    console.log(dim(`Created .env.local from .env.example.`));
  }
  const text = readFileSync(envPath, 'utf8');
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return { text, values };
}

/** Replaces the line in place if the key is there, appends it if not. Comments survive. */
function writeEnv(updates) {
  let text = readFileSync(envPath, 'utf8');
  const appended = [];

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(text)) text = text.replace(pattern, `${key}=${value}`);
    else appended.push(`${key}=${value}`);
  }

  if (appended.length > 0) {
    text = `${text.replace(/\n*$/, '\n')}\n# Added by scripts/setup-env.mjs\n${appended.join('\n')}\n`;
  }
  writeFileSync(envPath, text);
}

/* -------------------------------------------------------------------------- *
 * Prompting
 * -------------------------------------------------------------------------- */

/**
 * One readline interface for the whole run, with a queue in front of it.
 *
 * Two things went wrong before this shape and both are invisible when a human types the answers.
 * A fresh interface per question consumes everything still buffered on a pipe when it closes, so
 * the second question sees EOF. And a single interface still drops answers, because with a
 * non-TTY stdin readline emits every `line` as fast as it can read them — including while no
 * `question` is pending, when they go nowhere.
 *
 * So: read every line into a queue as it arrives, and let `ask` take from the queue or wait for
 * the next one. Correct for a person typing and for a script piping.
 */
let prompt = null;

function createPrompt() {
  const iface = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });

  const lines = [];
  const waiting = [];
  let muted = false;

  // Echo a dot per character rather than the key itself: these get pasted in cafés and
  // classrooms, and a shoulder is a threat model.
  const write = iface._writeToOutput?.bind(iface);
  if (write) {
    iface._writeToOutput = (chunk) => (muted ? iface.output.write('•') : write(chunk));
  }

  let closed = false;

  iface.on('line', (line) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line);
    else lines.push(line);
  });

  // Ctrl-D, or a pipe that ran out of answers. Without this every waiting prompt hangs for ever
  // and a half-finished setup looks like a crash.
  iface.on('close', () => {
    closed = true;
    while (waiting.length > 0) waiting.shift()(null);
  });

  return {
    close: () => iface.close(),
    ask(question, { secret = false } = {}) {
      process.stdout.write(question);
      muted = secret;
      const done = (line) => {
        muted = false;
        if (secret) process.stdout.write('\n');
        return line.trim();
      };
      const buffered = lines.shift();
      if (buffered !== undefined) return Promise.resolve(done(buffered));
      if (closed) return Promise.resolve(null);
      return new Promise((resolvePrompt) =>
        waiting.push((line) => resolvePrompt(line === null ? null : done(line))),
      );
    },
  };
}

const ask = (question, options) => prompt.ask(question, options);

async function askField(field, current) {
  const isSet = current && current.length > 0 && !(field.stale?.(current) ?? false);
  if (isSet && !askAll) return null;

  console.log(`\n${bold(field.label)}`);
  console.log(dim(`  ${field.where}`));
  if (field.example) console.log(dim(`  e.g. ${field.example}`));
  if (isSet) console.log(dim('  Already set — press enter to keep it.'));
  else if (current && field.stale?.(current)) {
    const shown = current.length > 32 ? `${current.slice(0, 32)}…` : current;
    console.log(yellow(`  Currently ${shown} — that is the local stack, not your project.`));
  }

  while (true) {
    const answer = await ask('  > ', { secret: Boolean(field.secret) });
    if (answer === null) throw new EndOfInput();
    if (!answer) {
      if (isSet) return null;
      console.log(red('  This one is needed.'));
      continue;
    }
    const cleaned = field.clean ? field.clean(answer) : answer;
    const problem = field.validate?.(cleaned);
    if (problem) {
      console.log(red(`  ${problem}`));
      continue;
    }
    return cleaned;
  }
}

/** Thrown when stdin ends mid-run, so what was answered is still saved. */
class EndOfInput extends Error {}

/* -------------------------------------------------------------------------- *
 * GitHub
 * -------------------------------------------------------------------------- */

function gh(args) {
  return execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function pushToGithub(values) {
  try {
    gh(['auth', 'status']);
  } catch {
    console.log(
      red('\n`gh` is not signed in. Run `gh auth login`, then `pnpm setup:env --github`.'),
    );
    return;
  }

  const ref = /https:\/\/([a-z0-9-]+)\.supabase\.co/.exec(
    values.NEXT_PUBLIC_SUPABASE_URL ?? '',
  )?.[1];
  const origin =
    values.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://lumen.marvinmaiwang.workers.dev';
  const host = origin.replace(/^https?:\/\//, '');

  const variables = {
    NEXT_PUBLIC_SUPABASE_URL: values.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // Production plus every per-pull-request preview, which is why the allowlist takes a wildcard.
    ALLOWED_ORIGINS: `${origin},*.${host.split('.').slice(-3).join('.')}`,
  };

  const secrets = {
    ...Object.fromEntries(
      [...FIELDS, ...GENERATED]
        .filter((field) => field.github === 'secret')
        .map((field) => [field.key, values[field.key]]),
    ),
    ...(ref ? { SUPABASE_PROJECT_REF: ref } : {}),
  };

  console.log(`\n${bold('Pushing to GitHub Actions')}`);
  for (const [key, value] of Object.entries(variables)) {
    if (!value) continue;
    gh(['variable', 'set', key, '--body', value]);
    console.log(`  ${green('✓')} variable ${key}`);
  }
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) continue;
    gh(['secret', 'set', key, '--body', value]);
    console.log(
      `  ${green('✓')} secret   ${key} ${dim('(write-only — GitHub will not show it back)')}`,
    );
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  prompt = createPrompt();
  console.log(bold('\nLumen — environment setup'));
  console.log(dim(`Writing to ${envPath}`));
  console.log(
    dim('Nothing you type is echoed, logged, or sent anywhere except GitHub if you ask.'),
  );

  const { values } = readEnv();
  const updates = {};

  let interrupted = false;
  for (const field of FIELDS) {
    try {
      const answer = await askField(field, values[field.key]);
      if (answer !== null) updates[field.key] = answer;
    } catch (error) {
      if (!(error instanceof EndOfInput)) throw error;
      // Save what was answered rather than losing it, and say where it stopped.
      interrupted = true;
      break;
    }
  }

  for (const field of GENERATED) {
    if (!values[field.key] || askAll) {
      updates[field.key] = field.generate();
      console.log(`\n${bold(field.label)}\n${dim('  Generated for you — 32 random bytes.')}`);
    }
  }

  if (Object.keys(updates).length > 0) {
    writeEnv(updates);
    console.log(`\n${green('✓')} Wrote ${Object.keys(updates).length} value(s) to .env.local`);
  } else {
    console.log(`\n${green('✓')} Everything was already set.`);
  }

  const merged = { ...values, ...updates };

  if (interrupted) console.log(yellow('\nStopped early — what you answered has been saved.'));

  const missing = FIELDS.filter((field) => {
    const value = merged[field.key];
    return !value || (field.stale?.(value) ?? false);
  });
  if (missing.length > 0) {
    console.log(yellow(`\nStill missing: ${missing.map((f) => f.key).join(', ')}`));
  }

  if (doGithub) {
    pushToGithub(merged);
  } else {
    console.log(dim('\nRun `pnpm setup:env --github` to push these to GitHub Actions as well.'));
  }

  console.log('');
  prompt.close();
}

main().catch((error) => {
  console.error(red(`\n${error.message}`));
  process.exit(1);
});
