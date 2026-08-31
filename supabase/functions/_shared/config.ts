/**
 * `app_config`, cached for a minute.
 *
 * The whole point of that table is that the caps, the quotas and the kill switch are editable in
 * production without a deploy (02-ARCHITECTURE.md §7), so the cache has to be short enough that
 * flipping `enhance_enabled` stops the calls while someone is still watching the dashboard. Sixty
 * seconds is the compromise: one read per instance per minute, and a kill switch that takes effect
 * inside the time it takes to refresh a page.
 */
import { select } from './db.ts';
import type { AppConfig } from '../../../lib/ai/router.ts';

/**
 * Sixty seconds by default. `APP_CONFIG_TTL_MS` overrides it — set to 0 by the integration test,
 * which changes a cap and expects the very next request to obey it, and available to an operator
 * who wants a kill switch that takes effect faster than a page refresh.
 */
const TTL_MS = Number(Deno.env.get('APP_CONFIG_TTL_MS') ?? 60_000);

let cached: { at: number; config: AppConfig } | null = null;

interface Row {
  key: string;
  value: unknown;
}

/** Used when the table has no row for a key — the same values `0000_init.sql` seeds. */
const DEFAULTS: AppConfig = {
  enhance_enabled: true,
  monthly_cap_cny: 100,
  daily_cap_cny: 6,
  quota: {
    anon: { enhance_per_day: 3, regen_fraction: 0.25, ocr_per_day: 3 },
    verified: { enhance_per_day: 20, regen_fraction: 0.25, ocr_per_day: 20 },
    byok: { enhance_per_day: 1000, ocr_per_day: 1000 },
  },
  credit_weights: { tidy: 0.6, complete: 1, study_guide: 1.4, ocr_page: 0.15, regen: 0.25 },
  pricing: {},
  models: {
    primary: 'deepseek-v4-flash',
    verify: 'deepseek-v4-pro',
    vision: 'deepseek-v4-flash-vision-exp',
    fallback: 'gemini-3.6-flash',
  },
  limits: {
    max_chars: 60_000,
    max_pages: 60,
    max_bytes: 26_214_400,
    max_tokens: {
      tidy: 4000,
      complete: 8000,
      study_guide: 10_000,
      verify: 3000,
      detect: 300,
      ocr: 4000,
    },
    anon_lifetime_calls: 15,
    ip_calls_per_hour: 20,
  },
};

export interface LoadedConfig extends AppConfig {
  verify_families: string[];
  feature_flags: Record<string, boolean>;
}

export async function loadConfig(): Promise<LoadedConfig> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.config as LoadedConfig;

  const rows = await select<Row>('app_config?select=key,value');
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const read = <T>(key: string, fallback: T): T => (map.has(key) ? (map.get(key) as T) : fallback);

  const config: LoadedConfig = {
    enhance_enabled: read('enhance_enabled', DEFAULTS.enhance_enabled),
    monthly_cap_cny: read('monthly_cap_cny', DEFAULTS.monthly_cap_cny),
    daily_cap_cny: read('daily_cap_cny', DEFAULTS.daily_cap_cny),
    quota: read('quota', DEFAULTS.quota),
    credit_weights: read('credit_weights', DEFAULTS.credit_weights),
    pricing: read('pricing', DEFAULTS.pricing),
    models: read('models', DEFAULTS.models),
    limits: read('limits', DEFAULTS.limits),
    reasoning: read('reasoning', DEFAULTS.reasoning ?? {}),
    verify_families: read('verify_families', ['stem-quantitative', 'stem-descriptive']),
    feature_flags: read('feature_flags', { ocr_enabled: true }),
  };

  cached = { at: now, config };
  return config;
}

/** Tests and the admin path need to see an edit immediately. */
export function clearConfigCache(): void {
  cached = null;
}
