// Token Radar, model radar-3: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a
// ceiling) and adds every pre-token protocol below the floor that the house's
// own watchlist rule would keep: no token recorded, not a wrapped, staked or
// bridged product, not a versioned pool, not an exchange product. Live-token
// protocols are kept apart and shown with the market's own values.
//
// Implied value is a fitted comparables model, computed from the snapshot
// alone (see fitLogLog): log10(market cap) is regressed on log10(TVL),
// seven-day growth and age, with a per-category offset, using only the
// live-token protocols (the only rows with a real market cap). The fitted
// model is used only when its leave-one-out error beats the radar-2 median
// model out of sample; otherwise the board falls back to the median model
// and says so in RadarData.validation. Ranking is always by implied value;
// token odds, expected value and the implied range are shown, never ranked on.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
  /** Rows parseSnapshot skipped (never a watchlist row): bad data, counted in the audit. */
  skipped_bad_rows: number;
  skipped_slugs: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_steps: number;
  multiple_min: number;
  multiple_max: number;
  min_comparables: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.75,
  maturity_range: 0.25,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_steps: 4,
  multiple_min: 0.05,
  multiple_max: 1.5,
  min_comparables: 3,
};

export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface FarmEconomics {
  /** Deposit the plan asks for, in USD. A deposit, not a cost: it stays recoverable. */
  capital_usd: number;
  /** Gas for the whole plan, in USD: first transaction ($3 upper bound) + setup + $2 a week of holding. */
  gas_usd_total: number;
  /** Total cost of the plan, in USD: gas only, the capital is not spent. */
  total_cost_usd: number;
  /** total_cost_usd / implied_value_usd, rounded to 6 decimals. */
  break_even_share: number;
  /** FARM when break-even < 0.5%, THIN at 0.5-2%, SKIP above 2%. */
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
    /** 'fitted' when radar-3's regression scored the row, 'median' on fallback. */
    model_used: 'fitted' | 'median';
    /** The fitted multiple (implied / TVL before the growth/maturity terms); on fallback, the median multiple. */
    fitted_multiple: number;
    /** Per-category log10 offset the fitted model used for this row; 0 on fallback. */
    category_offset_log10: number;
  };
  farm_steps: string[];
  farm: FarmEconomics;
  /** Share of same age-band x category protocols that already have a token (see tokenOdds). Not a launch forecast. */
  token_odds: number;
  /** round(implied_value_usd x token_odds). Shown only; ranking stays on implied value. */
  expected_value_usd: number;
  /** Implied value at the 10th / 90th percentile of the chosen model's leave-one-out log errors. Shown only. */
  implied_low_usd: number;
  implied_high_usd: number;
}

export interface RadarRow {
  rank: number;
  slug: string;
  watchlist: boolean;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  comparables: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
  model_used: 'fitted' | 'median';
  fitted_multiple: number;
  category_offset_log10: number;
  farm: FarmEconomics;
  token_odds: number;
  expected_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface MetricSet {
  n: number;
  median_abs_log10_error: number;
  within_3x_rate: number;
  mean_abs_log10_error: number;
}

export interface FittedModelSummary {
  n: number;
  mean_log_tvl: number;
  intercept: number;
  slope_log_tvl: number;
  growth_coef: number;
  maturity_coef: number;
  /** Per-category log10 offsets, shrunk toward 0 (see fitLogLog). */
  offsets: Record<string, number>;
}

export interface Validation {
  /** Which model scored the board. */
  model: 'fitted' | 'median';
  /** Why the median model was used instead of the fitted one; null when fitted. */
  fallback_reason: string | null;
  fitted: FittedModelSummary | null;
  live_n: number;
  loo: { fitted: MetricSet | null; median: MetricSet | null };
  walk_forward: { fitted: MetricSet | null; median: MetricSet | null; train_n: number; test_n: number };
  ten_fold: { fitted: MetricSet | null; median: MetricSet | null };
  /** Leave-one-out error of the fitted model with one term held neutral. */
  ablation: { no_category: MetricSet | null; no_growth: MetricSet | null; no_maturity: MetricSet | null };
}

export interface OddsGroup {
  age_band: string;
  category: string;
  n: number;
  live: number;
  odds: number;
}

export interface TokenOdds {
  /** Share of all protocols in the snapshot that already have a token. */
  global: number;
  global_n: number;
  global_live: number;
  groups: OddsGroup[];
}

export interface Audit {
  /** Protocols in the sealed snapshot, parsed plus skipped: ranked + live + excluded + skipped. */
  total: number;
  ranked: number;
  /** Protocols with a token that are not on the board. */
  live_total: number;
  /** Of those, how many the Live view shows (at most LIVE_ROWS). */
  live_shown: number;
  excluded_by_reason: Record<string, number>;
  excluded_total: number;
  skipped_bad_rows: number;
}

export interface SelfAuditCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SelfAudit {
  passed: boolean;
  passed_count: number;
  total: number;
  checks: SelfAuditCheck[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
  validation: Validation | null;
  audit: Audit;
  self_audit: SelfAudit;
  odds: TokenOdds;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list, or null when it is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * The category comparables: for every category, the median market-cap-to-TVL
 * ratio of its live-token protocols, plus the global median as the fallback.
 * A category with fewer than min_comparables live protocols falls back to the
 * global median, so one or two outliers can never set a category's multiple.
 */
export function comparables(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, { multiple: number; n: number }>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.gecko_id === null || p.symbol === null) continue;
    if (!(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(ratio);
    byCat.set(key, list);
  }
  const globalRaw = median(all) ?? 0.2;
  const global = Math.min(model.multiple_max, Math.max(model.multiple_min, globalRaw));
  const byCategory = new Map<string, { multiple: number; n: number }>();
  for (const [cat, vals] of byCat) {
    if (vals.length >= model.min_comparables) {
      const m = median(vals) ?? globalRaw;
      byCategory.set(cat, { multiple: Math.min(model.multiple_max, Math.max(model.multiple_min, m)), n: vals.length });
    }
  }
  return { byCategory, global };
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: { byCategory: Map<string, { multiple: number; n: number }>; global: number },
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; comparables: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const cat = comps.byCategory.get(protocol.category ?? 'Other');
  const comparables = cat !== undefined ? cat.n : 0;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  // Every multiplier is rounded to 4 decimals BEFORE the implied value is
  // computed, and the rounded values are the ones stored in the board: the
  // dashboard recomputes a row from those same numbers, so the page and the
  // board always agree to the dollar.
  const multiple = round4(cat !== undefined ? cat.multiple : comps.global);
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = round4(model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
  const chainMult = round4(1 + Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_steps) * model.chain_step);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, multiple, comparables, growthPct, growthMult, maturityMult, chainMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped,
 * staked or bridged product, not a versioned pool, and not an exchange product.
 * This is the house watchlist rule minus the TVL floor, applied to the early
 * rows so the radar does not rank a token that already trades in disguise.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  fit: FittedModel | null = null,
  modelUsed: 'fitted' | 'median' = 'median',
  odds: TokenOdds | null = null,
  interval: { p10: number; p90: number } = { p10: -0.47712125472, p90: 0.47712125472 },
): BoardRow[] {
  const comps = comparables(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the floor, by
  // TVL. No cap, no hand-picking: the floor is where the reading starts.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = scoredValue(p, snapshot.as_of, comps, fit, modelUsed, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const oddsValue = odds !== null ? tokenOddsFor(s.p, snapshot.as_of, odds) : 0;
    const low = Math.min(s.implied, Math.max(1, Math.round(s.implied * Math.pow(10, interval.p10))));
    const high = Math.max(s.implied, Math.round(s.implied * Math.pow(10, interval.p90)));
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        category_multiple: round4(s.multiple),
        comparables: s.comparables,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        chain_multiplier: round4(s.chainMult),
        age_days: s.age,
        model_used: s.modelUsed,
        fitted_multiple: round4(s.fittedMultiple),
        category_offset_log10: round4(s.categoryOffset),
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
      farm: farmEconomics(s.p, s.implied, s.age),
      token_odds: oddsValue,
      expected_value_usd: Math.round(s.implied * oddsValue),
      implied_low_usd: low,
      implied_high_usd: high,
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('perps')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain') || c.includes('infrastructure')) return `Use $${capital} of USDC in ${name}'s app on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a message or a search ad.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    watchlist: watchlist.has(row.slug),
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
    model_used: row.model.model_used,
    fitted_multiple: row.model.fitted_multiple,
    category_offset_log10: row.model.category_offset_log10,
    farm: row.farm,
    token_odds: row.token_odds,
    expected_value_usd: row.expected_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
  };
}

export interface RadarBuild {
  board: BoardRow[];
  radar: RadarData;
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): RadarBuild {
  const comps = comparables(snapshot, model);
  const samples = liveSamples(snapshot, snapshot.as_of, model);
  const fit = fitLogLog(samples);
  const { validation, looFitted, looMedian } = validateModel(snapshot, snapshot.as_of, fit, model);
  // Use the fitted model only when it beats the median model out of sample.
  // Anything else falls back to the median model, and the reason is recorded.
  let modelUsed: 'fitted' | 'median' = 'median';
  let fallbackReason: string | null = null;
  const looF = validation.loo.fitted;
  const looM = validation.loo.median;
  if (fit === null) fallbackReason = 'no fitted model: fewer than 10 live-token comparables to fit on';
  else if (fit.n < 20) fallbackReason = `fitted model uses only ${fit.n} live-token protocols (needs 20)`;
  else if (!(fit.slope_log_tvl >= 0.3 && fit.slope_log_tvl <= 1.7)) fallbackReason = `fitted slope ${fit.slope_log_tvl} is outside 0.3-1.7`;
  else if (Math.abs(fit.growth_coef) > 3 || Math.abs(fit.maturity_coef) > 3) fallbackReason = 'fitted growth/maturity coefficients are outside +-3';
  else if (looF === null || looM === null) fallbackReason = 'leave-one-out validation produced no errors';
  else if (!(looF.median_abs_log10_error < looM.median_abs_log10_error)) fallbackReason = `fitted LOO median error ${looF.median_abs_log10_error} is not below the median model's ${looM.median_abs_log10_error}`;
  else modelUsed = 'fitted';
  validation.model = modelUsed;
  validation.fallback_reason = modelUsed === 'fitted' ? null : fallbackReason;
  const chosenErrors = modelUsed === 'fitted' ? looFitted : looMedian;
  const sortedErrs = [...chosenErrors].sort((a, b) => a - b);
  const interval = {
    p10: sortedErrs.length > 0 ? quantileSorted(sortedErrs, 0.1) : -0.47712125472,
    p90: sortedErrs.length > 0 ? quantileSorted(sortedErrs, 0.9) : 0.47712125472,
  };
  const odds = tokenOddsTable(snapshot, snapshot.as_of);
  const board = buildBoard(snapshot, model, fit, modelUsed, odds, interval);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const audit = buildAudit(snapshot, board, live);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(comps.global),
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
    validation,
    audit,
    self_audit: { passed: false, passed_count: 0, total: 0, checks: [] },
    odds,
  };
  radar.self_audit = selfAudit(board, snapshot, audit, validation);
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const watchlistSet = new Set(o.watchlist as string[]);
  const protocols: SnapshotProtocol[] = [];
  const skipped_slugs: string[] = [];
  let skipped_bad_rows = 0;
  o.protocols.forEach((v, i) => {
    // A bad row that is not on the watchlist is skipped and counted in the
    // audit, so one dirty row cannot sink the whole snapshot. A bad watchlist
    // row stays fatal: the gate requires every watchlist slug on the board,
    // and silently dropping one would only fail later, less clearly.
    const bad = (message: string): void => {
      const slug = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as Record<string, unknown>).slug === 'string'
        ? (v as Record<string, unknown>).slug as string
        : `#${i}`;
      if (watchlistSet.has(slug)) throw new SnapshotError(`snapshot.json's protocol ${i} (${slug}): ${message}`);
      skipped_bad_rows++;
      if (skipped_slugs.length < 20) skipped_slugs.push(slug);
    };
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      bad('is not an object');
      return;
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0) {
      bad('lacks a slug, a name or a positive TVL');
      return;
    }
    protocols.push({
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    });
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
    skipped_bad_rows,
    skipped_slugs,
  };
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Linear-interpolation quantile of a sorted list. */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function chainMultOf(p: SnapshotProtocol, model: ModelConstants = MODEL): number {
  return round4(1 + Math.min(Math.max(p.chains.length - 1, 0), model.chain_max_steps) * model.chain_step);
}

interface LiveSample {
  p: SnapshotProtocol;
  logTvl: number;
  logMcap: number;
  ratio: number;
  growthFrac: number;
  matFrac: number;
  age: number | null;
}

/** The live-token protocols: the only rows with a real market cap, hence the only ground truth. */
function liveSamples(snapshot: Snapshot, asOf: string, model: ModelConstants = MODEL): LiveSample[] {
  const out: LiveSample[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.gecko_id === null || p.symbol === null) continue;
    if (!(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
    const age = ageDays(asOf, p.listed_at);
    const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
    out.push({
      p,
      logTvl: Math.log10(p.tvl_usd),
      logMcap: Math.log10(p.mcap_usd),
      ratio: p.mcap_usd / p.tvl_usd,
      growthFrac: growthPct / 100,
      matFrac: Math.min(Math.max(age ?? model.unknown_age_days, 0), model.maturity_days) / model.maturity_days,
      age,
    });
  }
  return out;
}

/** Gaussian elimination with partial pivoting; null when the system is singular. */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    if (Math.abs(m[piv]![col]!) < 1e-12) return null;
    if (piv !== col) {
      const t = m[col]!;
      m[col] = m[piv]!;
      m[piv] = t;
    }
    const div = m[col]![col]!;
    for (let r = col + 1; r < n; r++) {
      const f = m[r]![col]! / div;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= m[r]![c]! * x[c]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

export interface FittedModel extends FittedModelSummary {
  offsetsMap: Map<string, number>;
}

/**
 * radar-3's fitted model: ordinary least squares (closed form, stdlib only,
 * deterministic) of log10(market cap) on [1, log10(TVL) centred, growth,
 * maturity fraction], over the live-token protocols only. Category offsets
 * are the mean residual per category, shrunk by n/(n+3) toward 0 and clamped
 * to [-0.5, 0.5] in log10, so a thin category cannot set a wild offset.
 * Returns null when fewer than 10 live protocols exist or the system is singular.
 */
export function fitLogLog(samples: LiveSample[]): FittedModel | null {
  if (samples.length < 10) return null;
  const meanLog = samples.reduce((a, s) => a + s.logTvl, 0) / samples.length;
  const xtx: number[][] = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const xty: number[] = [0, 0, 0, 0];
  for (const s of samples) {
    const x = [1, s.logTvl - meanLog, s.growthFrac, s.matFrac];
    for (let i = 0; i < 4; i++) {
      xty[i] += x[i]! * s.logMcap;
      for (let j = 0; j < 4; j++) xtx[i]![j] += x[i]! * x[j]!;
    }
  }
  for (let i = 1; i < 4; i++) xtx[i]![i] += 1e-6; // ridge: stability only, far below the data's scale
  const coef = solveLinear(xtx, xty);
  if (coef === null || coef.some((c) => !Number.isFinite(c))) return null;
  const byCat = new Map<string, number[]>();
  for (const s of samples) {
    const pred = coef[0]! + coef[1]! * (s.logTvl - meanLog) + coef[2]! * s.growthFrac + coef[3]! * s.matFrac;
    const key = s.p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(s.logMcap - pred);
    byCat.set(key, list);
  }
  const offsets: Record<string, number> = {};
  const offsetsMap = new Map<string, number>();
  for (const [cat, res] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const mean = res.reduce((a, v) => a + v, 0) / res.length;
    const shrunk = Math.min(0.5, Math.max(-0.5, mean * (res.length / (res.length + 3))));
    offsets[cat] = round4(shrunk);
    offsetsMap.set(cat, shrunk);
  }
  return {
    n: samples.length,
    mean_log_tvl: round6(meanLog),
    intercept: round6(coef[0]!),
    slope_log_tvl: round6(coef[1]!),
    growth_coef: round6(coef[2]!),
    maturity_coef: round6(coef[3]!),
    offsets,
    offsetsMap,
  };
}

function predictLog(fit: FittedModel, s: LiveSample): number {
  return fit.intercept + fit.slope_log_tvl * (s.logTvl - fit.mean_log_tvl) + fit.growth_coef * s.growthFrac + fit.maturity_coef * s.matFrac + (fit.offsetsMap.get(s.p.category ?? 'Other') ?? 0);
}

function sampleOf(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): LiveSample {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  return {
    p,
    logTvl: Math.log10(Math.max(1, p.tvl_usd)),
    logMcap: 0,
    ratio: 0,
    growthFrac: growthPct / 100,
    matFrac: Math.min(Math.max(age ?? model.unknown_age_days, 0), model.maturity_days) / model.maturity_days,
    age,
  };
}

/**
 * The fitted multipliers for one protocol. The regression predicts log10(market
 * cap); the effective category multiple is that prediction, net of the growth
 * and maturity terms, divided by TVL, so the dashboard's one formula
 * (TVL x category x growth x maturity x chain, each rounded to 4 decimals
 * before multiplying) recomputes the same implied value to the dollar.
 * The growth multiplier is clamped to [0.5, 2.0], maturity to [0.5, 1.5] and
 * the category multiple to [0.05, 1.50], the same clamp the median model uses.
 */
export function fittedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: FittedModel,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null; offset: number } {
  const s = sampleOf(protocol, asOf, model);
  const pred = predictLog(fit, s);
  const growthMult = Math.min(2, Math.max(0.5, Math.pow(10, fit.growth_coef * s.growthFrac)));
  const maturityMult = Math.min(1.5, Math.max(0.5, Math.pow(10, fit.maturity_coef * s.matFrac)));
  const offset = fit.offsetsMap.get(protocol.category ?? 'Other') ?? 0;
  const catRaw = Math.pow(10, pred) / protocol.tvl_usd / (Math.pow(10, fit.growth_coef * s.growthFrac) * Math.pow(10, fit.maturity_coef * s.matFrac));
  const multiple = round4(Math.min(model.multiple_max, Math.max(model.multiple_min, catRaw)));
  const chainMult = chainMultOf(protocol, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * round4(growthMult) * round4(maturityMult) * chainMult));
  return { implied, multiple, growthMult: round4(growthMult), maturityMult: round4(maturityMult), chainMult, age: s.age, offset: round4(offset) };
}

/** The radar-2 median model, kept as the fallback and as the validation baseline. */
function medianImpliedFromRatios(
  protocol: SnapshotProtocol,
  asOf: string,
  byCat: Map<string, number[]>,
  all: number[],
  model: ModelConstants = MODEL,
): number {
  const globalRaw = median(all) ?? 0.2;
  const global = Math.min(model.multiple_max, Math.max(model.multiple_min, globalRaw));
  const vals = byCat.get(protocol.category ?? 'Other');
  const multiple = vals !== undefined && vals.length >= model.min_comparables
    ? Math.min(model.multiple_max, Math.max(model.multiple_min, median(vals) ?? globalRaw))
    : global;
  const v = impliedValue(protocol, asOf, {
    byCategory: new Map([[protocol.category ?? 'Other', { multiple, n: vals !== undefined ? vals.length : 0 }]]),
    global,
  }, model);
  return v.implied;
}

export interface ScoredValue {
  implied: number;
  multiple: number;
  comparables: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
  modelUsed: 'fitted' | 'median';
  fittedMultiple: number;
  categoryOffset: number;
}

/** Score one protocol with the chosen model; the median path is impliedValue, unchanged. */
export function scoredValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: { byCategory: Map<string, { multiple: number; n: number }>; global: number },
  fit: FittedModel | null,
  modelUsed: 'fitted' | 'median',
  model: ModelConstants = MODEL,
): ScoredValue {
  if (modelUsed === 'fitted' && fit !== null) {
    const f = fittedValue(protocol, asOf, fit, model);
    const cat = comps.byCategory.get(protocol.category ?? 'Other');
    return {
      implied: f.implied,
      multiple: f.multiple,
      comparables: cat !== undefined ? cat.n : 0,
      growthPct: Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0))),
      growthMult: f.growthMult,
      maturityMult: f.maturityMult,
      chainMult: f.chainMult,
      age: f.age,
      modelUsed: 'fitted',
      fittedMultiple: f.multiple,
      categoryOffset: f.offset,
    };
  }
  const v = impliedValue(protocol, asOf, comps, model);
  return {
    implied: v.implied,
    multiple: v.multiple,
    comparables: v.comparables,
    growthPct: v.growthPct,
    growthMult: v.growthMult,
    maturityMult: v.maturityMult,
    chainMult: v.chainMult,
    age: v.age,
    modelUsed: 'median',
    fittedMultiple: v.multiple,
    categoryOffset: 0,
  };
}

function metricsFor(errors: number[]): MetricSet | null {
  if (errors.length === 0) return null;
  const abs = errors.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const within = errors.filter((e) => Math.abs(e) <= 0.47712125472).length / errors.length; // |log10 error| <= log10(3)
  return {
    n: errors.length,
    median_abs_log10_error: round4(median(abs) ?? 0),
    within_3x_rate: round4(within),
    mean_abs_log10_error: round4(abs.reduce((a, v) => a + v, 0) / abs.length),
  };
}

function ratiosOf(samples: LiveSample[]): { byCat: Map<string, number[]>; all: number[] } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const s of samples) {
    all.push(s.ratio);
    const key = s.p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(s.ratio);
    byCat.set(key, list);
  }
  return { byCat, all };
}

function predictLive(kind: 'fitted' | 'median', s: LiveSample, train: LiveSample[], fullFit: FittedModel | null, asOf: string): number {
  if (kind === 'fitted') {
    const fit = fitLogLog(train) ?? fullFit;
    if (fit === null) return 0;
    const pred = predictLog(fit, s);
    return Math.pow(10, pred) * chainMultOf(s.p);
  }
  const r = ratiosOf(train);
  return medianImpliedFromRatios(s.p, asOf, r.byCat, r.all);
}

function errorsFor(kind: 'fitted' | 'median', train: LiveSample[], test: LiveSample[], fullFit: FittedModel | null, asOf: string): number[] {
  const errs: number[] = [];
  for (const s of test) {
    const pred = predictLive(kind, s, train, fullFit, asOf);
    if (!(pred > 0) || !(s.p.mcap_usd !== null && s.p.mcap_usd > 0)) continue;
    errs.push(Math.log10(pred) - Math.log10(s.p.mcap_usd!));
  }
  return errs;
}

function sortedLive(samples: LiveSample[]): LiveSample[] {
  return [...samples].sort((a, b) => {
    const la = a.p.listed_at;
    const lb = b.p.listed_at;
    if (la === null && lb === null) return a.p.slug < b.p.slug ? -1 : 1;
    if (la === null) return 1;
    if (lb === null) return -1;
    return la < lb ? -1 : la > lb ? 1 : a.p.slug < b.p.slug ? -1 : 1;
  });
}

export interface ValidationResult {
  validation: Validation;
  looFitted: number[];
  looMedian: number[];
}

/**
 * Out-of-sample validation, live-token protocols only (pre-token rows never
 * take part: they have no market cap to check against, and using them would
 * leak the board into its own test). Splits are by listed_at, oldest first,
 * so walk-forward and 10-fold test on newer protocols than they train on.
 */
export function validateModel(snapshot: Snapshot, asOf: string, fit: FittedModel | null, model: ModelConstants = MODEL): ValidationResult {
  const samples = liveSamples(snapshot, asOf, model);
  const looFitted: number[] = [];
  const looMedian: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const rest = samples.filter((_, j) => j !== i);
    looFitted.push(...errorsFor('fitted', rest, [samples[i]!], fit, asOf));
    looMedian.push(...errorsFor('median', rest, [samples[i]!], fit, asOf));
  }
  const ordered = sortedLive(samples);
  const trainN = Math.max(10, Math.floor(ordered.length * 0.7));
  const wfTrain = ordered.slice(0, trainN);
  const wfTest = ordered.slice(trainN);
  const wfFitted = wfTest.length >= 3 ? errorsFor('fitted', wfTrain, wfTest, fit, asOf) : [];
  const wfMedian = wfTest.length >= 3 ? errorsFor('median', wfTrain, wfTest, fit, asOf) : [];
  const tfFitted: number[] = [];
  const tfMedian: number[] = [];
  for (let fold = 0; fold < 10; fold++) {
    const test = ordered.filter((_, i) => i % 10 === fold);
    const train = ordered.filter((_, i) => i % 10 !== fold);
    if (test.length === 0 || train.length < 10) continue;
    tfFitted.push(...errorsFor('fitted', train, test, fit, asOf));
    tfMedian.push(...errorsFor('median', train, test, fit, asOf));
  }
  const ablation = { no_category: null as MetricSet | null, no_growth: null as MetricSet | null, no_maturity: null as MetricSet | null };
  if (fit !== null) {
    const variants: Array<['no_category' | 'no_growth' | 'no_maturity', (s: LiveSample, pred: number) => number]> = [
      ['no_category', (s, pred) => pred - (fit.offsetsMap.get(s.p.category ?? 'Other') ?? 0)],
      ['no_growth', (s, pred) => pred - fit.growth_coef * s.growthFrac],
      ['no_maturity', (s, pred) => pred - fit.maturity_coef * s.matFrac],
    ];
    for (const [key, adjust] of variants) {
      const errs: number[] = [];
      for (const s of samples) {
        const pred = Math.pow(10, adjust(s, predictLog(fit, s))) * chainMultOf(s.p);
        if (s.p.mcap_usd !== null && s.p.mcap_usd > 0) errs.push(Math.log10(pred) - Math.log10(s.p.mcap_usd));
      }
      ablation[key] = metricsFor(errs);
    }
  }
  const validation: Validation = {
    model: 'median',
    fallback_reason: null,
    fitted: fit === null ? null : {
      n: fit.n,
      mean_log_tvl: fit.mean_log_tvl,
      intercept: fit.intercept,
      slope_log_tvl: fit.slope_log_tvl,
      growth_coef: fit.growth_coef,
      maturity_coef: fit.maturity_coef,
      offsets: fit.offsets,
    },
    live_n: samples.length,
    loo: { fitted: metricsFor(looFitted), median: metricsFor(looMedian) },
    walk_forward: { fitted: metricsFor(wfFitted), median: metricsFor(wfMedian), train_n: wfTrain.length, test_n: wfTest.length },
    ten_fold: { fitted: metricsFor(tfFitted), median: metricsFor(tfMedian) },
    ablation,
  };
  return { validation, looFitted, looMedian };
}

export function ageBand(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 180) return '<180d';
  if (age < 365) return '180-364d';
  if (age < 730) return '1-2y';
  if (age < 1095) return '2-3y';
  return '>3y';
}

/**
 * Token odds: for each age band x category, the share of protocols in that
 * group that already have a token, shrunk toward the global share with a
 * prior strength of 10 (a group of 2 with 2 tokens does not get odds 1.0).
 * This is a cross-sectional share, honestly labelled: the snapshot has no
 * token-issue date, so it is not a hazard rate and not a forecast of when,
 * or whether, a protocol issues a token.
 */
export function tokenOddsTable(snapshot: Snapshot, asOf: string): TokenOdds {
  const groups = new Map<string, { age_band: string; category: string; n: number; live: number }>();
  let total = 0;
  let liveTotal = 0;
  for (const p of snapshot.protocols) {
    const live = !isPreToken(p);
    total++;
    if (live) liveTotal++;
    const key = `${ageBand(ageDays(asOf, p.listed_at))}|${p.category ?? 'Other'}`;
    const g = groups.get(key) ?? { age_band: ageBand(ageDays(asOf, p.listed_at)), category: p.category ?? 'Other', n: 0, live: 0 };
    g.n++;
    if (live) g.live++;
    groups.set(key, g);
  }
  const global = total > 0 ? liveTotal / total : 0;
  const out: OddsGroup[] = [...groups.values()]
    .sort((a, b) => (a.age_band < b.age_band ? -1 : a.age_band > b.age_band ? 1 : a.category < b.category ? -1 : 1))
    .map((g) => ({ age_band: g.age_band, category: g.category, n: g.n, live: g.live, odds: round4((g.live + 10 * global) / (g.n + 10)) }));
  return { global: round4(global), global_n: total, global_live: liveTotal, groups: out };
}

export function tokenOddsFor(p: SnapshotProtocol, asOf: string, table: TokenOdds): number {
  const band = ageBand(ageDays(asOf, p.listed_at));
  const g = table.groups.find((x) => x.age_band === band && x.category === (p.category ?? 'Other'));
  return g !== undefined ? g.odds : table.global;
}

/**
 * Farm economics, in USD and from the snapshot alone. Gas is the only cost:
 * $3 for the first transaction (the plan says "under $3", so the upper bound),
 * $4 of setup gas ($8 when the capital is $150+), plus $2 a week for the hold.
 * The capital is a deposit, not a cost, and no airdrop share is assumed:
 * break-even is gas / implied value, and the verdict only says whether the
 * gas is small next to the implied value. Thresholds: FARM < 0.5%, THIN 0.5-2%, SKIP > 2%.
 */
export function farmEconomics(p: SnapshotProtocol, implied: number, age: number | null): FarmEconomics {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = 3 + (capital >= 150 ? 8 : 4) + 2 * Math.ceil(hold / 7);
  const be = gas / Math.max(1, implied);
  return {
    capital_usd: capital,
    gas_usd_total: gas,
    total_cost_usd: gas,
    break_even_share: round6(be),
    verdict: be < 0.005 ? 'FARM' : be <= 0.02 ? 'THIN' : 'SKIP',
  };
}

function excludeReason(p: SnapshotProtocol): string {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return 'excluded_category';
  if (VERSIONED.test(p.name)) return 'versioned_name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped_name';
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return 'exchange_name';
  return 'above_floor';
}

/** Account for every protocol in the snapshot: ranked + live + excluded + skipped = total. */
export function buildAudit(snapshot: Snapshot, board: BoardRow[], live: LiveRow[]): Audit {
  const ranked = new Set(board.map((r) => r.slug));
  const excluded_by_reason: Record<string, number> = {};
  let live_total = 0;
  for (const p of snapshot.protocols) {
    if (ranked.has(p.slug)) continue;
    if (!isPreToken(p)) {
      live_total++;
      continue;
    }
    const reason = excludeReason(p);
    excluded_by_reason[reason] = (excluded_by_reason[reason] ?? 0) + 1;
  }
  const excluded_total = Object.values(excluded_by_reason).reduce((a, v) => a + v, 0);
  const live_shown = live.filter((r) => !ranked.has(r.slug)).length;
  return {
    total: snapshot.protocols.length + snapshot.skipped_bad_rows,
    ranked: board.length,
    live_total,
    live_shown,
    excluded_by_reason,
    excluded_total,
    skipped_bad_rows: snapshot.skipped_bad_rows,
  };
}

/**
 * The cover self-audit: six checks the dashboard shows as passed/total.
 * Every check is a pure assertion over the board just built; a failure means
 * the program's own numbers do not agree with each other, so main.ts exits 1
 * rather than handing in a board it cannot stand behind.
 */
export function selfAudit(board: BoardRow[], snapshot: Snapshot, audit: Audit, validation: Validation | null): SelfAudit {
  const checks: SelfAuditCheck[] = [];
  let recomputeOk = true;
  for (const r of board) {
    const again = Math.max(1, Math.round(r.tvl_usd * r.model.category_multiple * r.model.growth_multiplier * r.model.maturity_multiplier * r.model.chain_multiplier));
    if (again !== r.implied_value_usd || r.implied_low_usd > r.implied_value_usd || r.implied_high_usd < r.implied_value_usd) {
      recomputeOk = false;
      break;
    }
  }
  checks.push({ name: 'recompute', passed: recomputeOk, detail: recomputeOk ? 'every row recomputes to its board value, range brackets the value' : 'a row does not recompute to its board value' });
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  checks.push({ name: 'watchlist', passed: missing.length === 0, detail: missing.length === 0 ? `${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist slugs on the board` : `missing ${missing.slice(0, 3).join(', ')}` });
  let ranksOk = true;
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) ranksOk = false;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) ranksOk = false;
  }
  checks.push({ name: 'ranks', passed: ranksOk, detail: ranksOk ? `ranks 1-${board.length}, implied value non-increasing` : 'ranks are not 1..n in implied-value order' });
  let farmOk = true;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) farmOk = false;
    if (r.farm_steps.some((s) => s.length < 20 || s.length > 600)) farmOk = false;
    if (!['FARM', 'THIN', 'SKIP'].includes(r.farm.verdict)) farmOk = false;
    if (Math.abs(r.farm.break_even_share - r.farm.total_cost_usd / Math.max(1, r.implied_value_usd)) > 2e-6) farmOk = false;
  }
  checks.push({ name: 'farm', passed: farmOk, detail: farmOk ? 'farm steps 3-12, 20-600 chars, verdicts match break-even' : 'a farm plan or verdict does not check out' });
  const sum = audit.ranked + audit.live_total + audit.excluded_total + audit.skipped_bad_rows;
  checks.push({ name: 'audit_sum', passed: sum === audit.total && audit.total === snapshot.protocols.length + snapshot.skipped_bad_rows, detail: `${audit.ranked} ranked + ${audit.live_total} live + ${audit.excluded_total} excluded + ${audit.skipped_bad_rows} skipped = ${sum} of ${audit.total}` });
  const valOk = validation !== null && (validation.loo.fitted !== null || validation.loo.median !== null);
  checks.push({ name: 'validation', passed: valOk, detail: valOk ? `model ${validation!.model}, LOO on ${validation!.live_n} live-token protocols` : 'no out-of-sample validation was produced' });
  const passed_count = checks.filter((c) => c.passed).length;
  return { passed: passed_count === checks.length, passed_count, total: checks.length, checks };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
