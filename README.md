# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gentle-quasar-36/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gentle-quasar-36/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token protocols by implied launch value, from a sealed DefiLlama snapshot. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## The model (radar-2)

Implied value is a comparables model, computed from the snapshot alone:

- **Category multiple**: the median market-cap-to-TVL ratio of the live-token protocols in the same category, when at least 3 exist; otherwise the global median (0.205x), clamped to 0.05x–1.50x.
- **Growth**: `1 + clamp(change_7d, -50, 100) / 100 × 0.6`
- **Maturity**: `0.75 + min(age_days, 1095) / 1095 × 0.25` — how long the protocol has run with no token.
- **Chain breadth**: `1 + min(chains - 1, 4) × 0.02`
- **Implied value**: `round(TVL × category multiple × growth × maturity × chains)`

No protocol name is special-cased. The board covers all 40 watchlist protocols plus 138 pre-token protocols below the $50M floor that the house watchlist rule would keep — 178 rows in all. Wrapped, staked and bridged products are excluded, and live-token protocols are set aside with their market caps shown. The board never predicts whether or when a token is issued.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, writes `board.json` and `data.js` to the output directory, copies `dashboard/` and `screenshots/` there, and writes `dossier.json` with the vendored make.fun library.

Open `out/dashboard/index.html` in a browser (no network needed): search, filter by category or chain, watchlist-only toggle, sortable columns, a live-token tab, and a detail view for every protocol with its model breakdown and six-step farm plan.
