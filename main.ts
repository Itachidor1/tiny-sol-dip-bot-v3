// tiny-sol-dip-bot-v3 — confirmed-bounce dip bot + capitulation-dip sleeve.
// Strategy (agent-fun/bars-replay/v1, one reply of orders per hourly bar batch):
//
// On every bar, for each of 6 symbols (FARTCOIN, JITOSOL, POPCAT, SOL, WETH, WIF;
// RAY excluded — its dips lost in every backtest variant, both halves):
//   - Compute a simple rolling RSI(14) over one-bar close changes.
//   - BASE sleeve: enter when RSI drops under 35 AND has risen two bars in a row.
//     The second rise confirms the bounce instead of catching a falling knife.
//   - DEEP sleeve: enter when RSI drops under 22 AND has risen one bar. A plunge
//     that deep bounces violently; waiting for a second confirming rise misses the
//     first bars of the V. Same stake, same exits as the base sleeve.
//   - Most oversold first, up to 4 open positions, 25% of equity each.
//   - Exit the whole position at +3.5% take-profit, -2.0% stop-loss, or after
//     16 bars held, whichever comes first. Otherwise sit in USDC.
// No shorts, no leverage, fully deterministic (no clock, no randomness).
//
// Why this shape: on the kit's dev window (136 hourly bars, 29 Oct - 3 Nov 2026,
// a broad downtape where buy-and-hold lost -869 USDC), the base sleeve alone made
// +453.10 USDC. Adding the deep sleeve — which fires only 3 times in 136 bars,
// all winners — lifts it to +522.72 in the exact-fill offline model, positive in
// both halves (+415 / +105 vs +374 / +77). The deep threshold sits in a stable
// band: 20/22/23/24/25 all beat the base sleeve, 22-23 best; 26+ turns the second
// half negative, so 22 stays well clear of that edge.

import { runBars } from './vendor/makefun-bars.ts';

const SYMBOLS = ['FARTCOIN', 'JITOSOL', 'POPCAT', 'SOL', 'WETH', 'WIF'];
const RSI_PERIOD = 14;
const RSI_BELOW = 35; // base sleeve: oversold line
const RSI_DEEP = 22; // deep sleeve: capitulation line (single-rise entry)
const MAX_POSITIONS = 4;
const STAKE_BPS = 2500; // 25% of equity per position
const TAKE_PROFIT = 0.035;
const STOP_LOSS = 0.02;
const MAX_HOLD_BARS = 16;
const MAX_SLIPPAGE_BPS = 300; // 3% vs the decision bar's close

// Simple RSI(14): average gain / (average gain + average loss) over the last 14
// one-bar close changes. Null until 15 closes are known.
function rsiSimple(closes: number[]): number | null {
  const n = closes.length;
  if (n <= RSI_PERIOD) return null;
  let gain = 0;
  let loss = 0;
  for (let j = n - RSI_PERIOD; j < n; j++) {
    const ch = closes[j] - closes[j - 1];
    if (ch > 0) gain += ch;
    else loss -= ch;
  }
  if (gain + loss === 0) return 50;
  return (100 * gain) / (gain + loss);
}

const closes = new Map<string, number[]>(); // symbol -> close prices (USDC, float)
const rsiHist = new Map<string, (number | null)[]>(); // symbol -> RSI per bar
const entryBar = new Map<string, number>(); // symbol -> seq the position first appeared

await runBars({
  onBatch(state, batch) {
    // Fold this batch's bars into history first (state.latest already holds them).
    for (const bar of batch.bars) {
      const sym = state.symbols.get(bar.symbol);
      if (!sym) continue;
      const price = Number(bar.c) / 10 ** sym.price_scale;
      const hist = closes.get(bar.symbol) ?? [];
      hist.push(price);
      closes.set(bar.symbol, hist);
      const rHist = rsiHist.get(bar.symbol) ?? [];
      rHist.push(rsiSimple(hist));
      rsiHist.set(bar.symbol, rHist);
    }
    // Remember when each open position first appeared (fill bar = entry bar).
    for (const sym of state.positions.keys()) {
      if (!entryBar.has(sym)) entryBar.set(sym, state.seq);
    }
    for (const sym of [...entryBar.keys()]) {
      if (!state.positions.has(sym)) entryBar.delete(sym);
    }
    if (state.warmingUp) return [];

    const orders: { side: 'buy' | 'sell'; symbol: string; notional_quote_units?: bigint; qty?: bigint; max_slippage_bps: number }[] = [];
    const sells = new Set<string>();

    // --- exits: whole position at TP / SL / max hold ---
    for (const [sym, p] of state.positions) {
      const close = state.close(sym);
      if (close === null) continue;
      const value = state.value(sym, p.qty);
      const cost = p.cost;
      if (cost <= 0n) continue;
      const ret = Number(value) / Number(cost) - 1;
      const held = state.seq - (entryBar.get(sym) ?? state.seq);
      if (ret >= TAKE_PROFIT || ret <= -STOP_LOSS || held >= MAX_HOLD_BARS) {
        orders.push({ side: 'sell', symbol: sym, qty: p.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        sells.add(sym);
      }
    }

    // --- entries: most oversold first ---
    const cands: { sym: string; r: number }[] = [];
    for (const sym of SYMBOLS) {
      if (state.positions.has(sym)) continue;
      const rHist = rsiHist.get(sym) ?? [];
      const m = rHist.length;
      if (m < 3) continue;
      const r = rHist[m - 1];
      const r1 = rHist[m - 2];
      const r2 = rHist[m - 3];
      if (r === null || r1 === null || r2 === null) continue;
      const baseSignal = r < RSI_BELOW && r > r1 && r1 > r2;
      const deepSignal = r < RSI_DEEP && r > r1;
      if (baseSignal || deepSignal) cands.push({ sym, r });
    }
    cands.sort((a, b) => a.r - b.r);

    const slots = MAX_POSITIONS - (state.positions.size - sells.size);
    let cashLeft = state.cash;
    let placed = 0;
    for (const c of cands) {
      if (placed >= Math.max(0, slots)) break;
      const amt = (BigInt(STAKE_BPS) * state.equity) / 10000n;
      const notional = amt < cashLeft ? amt : cashLeft;
      if (notional < 1000000n) break; // below the harness minimum notional (1 USDC)
      orders.push({ side: 'buy', symbol: c.sym, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cashLeft -= notional;
      placed++;
    }
    return orders;
  },
});
