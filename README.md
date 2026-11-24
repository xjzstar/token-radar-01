# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xjzstar/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xjzstar/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token protocols by implied launch value, from a sealed DefiLlama snapshot. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## The model (radar-3)

Implied value is a fitted comparables model, computed from the snapshot alone:

- **Fitted regression**: `log10(market cap) = a + b·log10(TVL) + c·(change_7d/100) + d·(age_days/1095) + category offset`, fitted by ordinary least squares (closed form, standard library only, deterministic) on the live-token protocols — the only rows with a real market cap. Category offsets are mean residuals per category, shrunk by `n/(n+3)` toward 0 and clamped to ±0.5 in log10.
- **Effective multiples**: the regression prediction is split back into the dashboard's one formula — `implied = round(TVL × category_multiple × growth × maturity × chain)`, each multiplier rounded to 4 decimals first — so the page recomputes every row to the dollar. Growth is clamped to 0.5–2.0, maturity to 0.5–1.5, the category multiple to 0.05x–1.50x.
- **Fallback**: the fitted model is used only when its leave-one-out median log error beats the radar-2 median model (median market-cap/TVL per category, ≥3 comparables, otherwise the global median 0.2138x, clamped 0.05x–1.50x, with the hand-written growth/maturity/chain multipliers). Otherwise the board falls back to the median model and records the reason in `RadarData.validation`.
- **Validation, out of sample**: leave-one-out, walk-forward (oldest 70% train, newest 30% test, split by `listed_at`) and 10-fold, reporting median absolute log10 error and within-3x rate for both models, plus ablation (one fitted term neutral at a time). Only live-token protocols take part — pre-token rows have no market cap to check against.
- **Token odds**: for each age band (<180d, 180–364d, 1–2y, 2–3y, >3y, unknown) × category, the share of protocols in that group that already have a token, shrunk toward the global share with a prior strength of 10. This is a cross-sectional share, not a hazard rate and not a forecast of when or whether a token appears — the snapshot has no token-issue date. Expected value is `implied × odds`; ranking stays on implied value.
- **Farm verdicts**: each row carries structured farm economics — capital (a deposit, not a cost), gas for the whole plan ($3 first transaction + $4/$8 setup + $2 a week of holding), total cost (gas only), and break-even share (gas / implied value). Verdict: FARM under 0.5%, THIN at 0.5–2%, SKIP above 2%. No airdrop share is assumed.
- **Implied range**: each row's implied value at the 10th–90th percentile of the chosen model's leave-one-out log errors. Shown only; it never affects ranking.
- **Audit**: every protocol in the snapshot is accounted for — ranked + live-token set aside + excluded by reason + bad rows skipped = total (758 in the sealed snapshot). The dashboard shows the audit on the cover.
- **Self-audit**: six checks run on every build (recompute to the dollar, watchlist coverage, ranks 1..n in implied-value order, farm steps valid and verdicts matching break-even, audit sums to total, validation produced). A failure exits 1 instead of handing in a board the program cannot stand behind.

No protocol name is special-cased. The board covers all 40 watchlist protocols plus 138 pre-token protocols below the $50M floor that the house watchlist rule would keep — 178 rows in all. Wrapped, staked and bridged products are excluded, and live-token protocols are set aside with their market caps shown. The board never predicts whether or when a token is issued.

## Robustness

- `main.ts` wraps the whole run in a top-level try/catch: snapshot problems exit 2, everything else exits 1, and the message is one clean line on stderr — never a stack trace.
- `parseSnapshot` skips a bad protocol row that is not on the watchlist and counts it in the audit, so one dirty row cannot sink the whole snapshot. A bad watchlist row stays fatal, because the gate requires every watchlist slug on the board.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, writes `board.json` and `data.js` to the output directory, copies `dashboard/` and `screenshots/` there, and writes `dossier.json` with the vendored make.fun library.

Open `out/dashboard/index.html` in a browser (no network needed): search, filter by category or chain, watchlist-only toggle, sortable columns, a live-token tab, and a detail view for every protocol with its model breakdown, token odds, expected value, implied range and six-step farm plan, plus the audit, validation and self-audit on the cover.

---

<sub>Entered on [make.fun](https://make.fun/?ref=7yd20ms9&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
