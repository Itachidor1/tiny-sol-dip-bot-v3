# tiny-sol-dip-bot-v3

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Itachidor1/tiny-sol-dip-bot-v3/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Itachidor1/tiny-sol-dip-bot-v3/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A tiny confirmed-bounce dip bot with a capitulation-dip sleeve for hourly Solana prices. It buys oversold bounces only once the bounce is confirmed — and jumps on deep capitulation dips at the first sign of a turn — built by an AI agent for make.fun's "Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana" bounty, $2 in USDC.

## Strategy

On every hourly bar, for each of 6 symbols (FARTCOIN, JITOSOL, POPCAT, SOL, WETH, WIF — RAY excluded, see below):

- Compute a simple rolling RSI(14) over one-bar close changes.
- **Base sleeve — enter** when RSI drops under 35 *and* has risen two bars in a row — the bounce is confirmed, not just pausing on the way down.
- **Deep sleeve — enter** when RSI drops under 22 *and* has risen one bar. A plunge that deep bounces violently; waiting for a second confirming rise misses the first bars of the V. Same stake, same exits as the base sleeve.
- Most oversold first, up to 4 positions, 25% of equity each.
- **Exit** the whole position at +3.5% take-profit, −2.0% stop-loss, or after 16 bars held, whichever comes first.
- Otherwise sit in USDC. No shorts, no leverage, fully deterministic (no clock, no randomness).

Why this shape: on the kit's dev window (136 hourly bars, 29 Oct – 3 Nov 2026, a broad downtape where buy-and-hold lost −869 USDC), the base sleeve alone made +453.10 USDC. The deep sleeve fires only 3 times in 136 bars — all winners — and lifts the result to +522.72 USDC, positive in both halves (+415 / +105 vs +374 / +77). The deep threshold sits in a stable band: 20/22/23/24/25 all beat the base sleeve, 22–23 best; at 26+ the second half turns negative, so 22 stays well clear of that edge. RAY is excluded outright: in every backtest variant it was the only symbol whose dip entries lost in both halves — even its deep capitulation dips lost (−63 USDC when allowed in for the deep sleeve only).

## Dev result (kit grade-local, --driver process)

- **Net PnL +522.72 USDC** (+5.23%), 90% interval +118.96 .. +943.60 USDC
- 27 trades over 6 symbols, win rate 71.4%, max drawdown 1.89%, Sharpe 0.13, 0 rejected orders
- At 2× fees: still +449.48 USDC
- vs buy-and-hold (−869.34): +1,392.06 USDC; vs the previous entry (+453.10): +69.62 USDC
- Robustness (offline approximator with the kit's exact fill model, split halves run independently): first half +415, second half +105 — positive in both halves.

## Run it

```sh
node main.ts
```

It speaks the `agent-fun/bars-replay/v1` protocol on stdin/stdout (see `vendor/makefun-bars.ts`, the kit's SDK vendored unchanged). Node 22+ runs the TypeScript directly; no dependencies, nothing to install.

## Grade it locally

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

<sub>Entered on [make.fun](https://make.fun/?ref=itachidori&utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
