import { SMA, RSI, MACD, EMA } from 'technicalindicators';
import type { OHLCV, Exchange } from '@platform/shared';

export interface RuleResult {
  signalType: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  ruleName: string;
}

export class RuleEngine {
  evaluate(symbol: string, exchange: Exchange, candles: OHLCV[]): RuleResult[] {
    if (candles.length < 50) return [];

    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);
    const results: RuleResult[] = [];

    const crossResult = this.checkMACross(closes);
    if (crossResult) results.push(crossResult);

    const rsiResult = this.checkRSI(closes);
    if (rsiResult) results.push(rsiResult);

    const macdResult = this.checkMACD(closes);
    if (macdResult) results.push(macdResult);

    const volResult = this.checkVolumeSpike(volumes, closes);
    if (volResult) results.push(volResult);

    const emaResult = this.checkEMATrend(closes);
    if (emaResult) results.push(emaResult);

    return results;
  }

  private checkMACross(closes: number[]): RuleResult | null {
    if (closes.length < 200) return null;

    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });

    if (sma50.length < 2 || sma200.length < 2) return null;

    const currentSma50 = sma50[sma50.length - 1];
    const prevSma50 = sma50[sma50.length - 2];
    const currentSma200 = sma200[sma200.length - 1];
    const prevSma200 = sma200[sma200.length - 2];

    if (prevSma50 <= prevSma200 && currentSma50 > currentSma200) {
      return {
        signalType: 'BUY',
        confidence: 75,
        reasoning: `Golden Cross: SMA(50) ${currentSma50.toFixed(2)} crossed above SMA(200) ${currentSma200.toFixed(2)}`,
        ruleName: 'golden_cross',
      };
    }

    if (prevSma50 >= prevSma200 && currentSma50 < currentSma200) {
      return {
        signalType: 'SELL',
        confidence: 75,
        reasoning: `Death Cross: SMA(50) ${currentSma50.toFixed(2)} crossed below SMA(200) ${currentSma200.toFixed(2)}`,
        ruleName: 'death_cross',
      };
    }

    return null;
  }

  private checkRSI(closes: number[]): RuleResult | null {
    const rsi = RSI.calculate({ period: 14, values: closes });
    if (rsi.length === 0) return null;

    const currentRSI = rsi[rsi.length - 1];

    if (currentRSI < 30) {
      return {
        signalType: 'BUY',
        confidence: 70,
        reasoning: `RSI(14) at ${currentRSI.toFixed(1)} — Oversold territory (< 30)`,
        ruleName: 'rsi_oversold',
      };
    }

    if (currentRSI > 70) {
      return {
        signalType: 'SELL',
        confidence: 70,
        reasoning: `RSI(14) at ${currentRSI.toFixed(1)} — Overbought territory (> 70)`,
        ruleName: 'rsi_overbought',
      };
    }

    return null;
  }

  private checkMACD(closes: number[]): RuleResult | null {
    const macdResults = MACD.calculate({
      values: closes,
      fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
      SimpleMAOscillator: false, SimpleMASignal: false,
    });

    if (macdResults.length < 2) return null;

    const current = macdResults[macdResults.length - 1];
    const prev = macdResults[macdResults.length - 2];

    if (current.MACD == null || current.signal == null || prev.MACD == null || prev.signal == null) return null;

    if (prev.MACD <= prev.signal && current.MACD > current.signal) {
      return {
        signalType: 'BUY',
        confidence: 65,
        reasoning: `MACD bullish crossover: MACD(${current.MACD.toFixed(2)}) crossed above Signal(${current.signal.toFixed(2)})`,
        ruleName: 'macd_bullish_crossover',
      };
    }

    if (prev.MACD >= prev.signal && current.MACD < current.signal) {
      return {
        signalType: 'SELL',
        confidence: 65,
        reasoning: `MACD bearish crossover: MACD(${current.MACD.toFixed(2)}) crossed below Signal(${current.signal.toFixed(2)})`,
        ruleName: 'macd_bearish_crossover',
      };
    }

    return null;
  }

  private checkVolumeSpike(volumes: number[], closes: number[]): RuleResult | null {
    if (volumes.length < 21) return null;

    const avgVol20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const currentVol = volumes[volumes.length - 1];

    if (currentVol > avgVol20 * 2) {
      const priceChange = closes[closes.length - 1] - closes[closes.length - 2];
      const direction = priceChange > 0 ? 'BUY' : 'SELL';
      return {
        signalType: direction as 'BUY' | 'SELL',
        confidence: 60,
        reasoning: `Volume spike: Current volume (${currentVol.toLocaleString()}) is ${(currentVol / avgVol20).toFixed(1)}x the 20-day average (${avgVol20.toLocaleString()})`,
        ruleName: 'volume_spike',
      };
    }

    return null;
  }

  private checkEMATrend(closes: number[]): RuleResult | null {
    if (closes.length < 25) return null;

    const ema20 = EMA.calculate({ period: 20, values: closes });
    if (ema20.length < 5) return null;

    const recent5 = closes.slice(-5);
    const recentEma5 = ema20.slice(-5);
    const allAbove = recent5.every((price, i) => price > recentEma5[i]);

    if (allAbove) {
      return {
        signalType: 'BUY',
        confidence: 60,
        reasoning: `Strong uptrend: Price above EMA(20) for 5 consecutive days. Current EMA(20): ${recentEma5[recentEma5.length - 1].toFixed(2)}`,
        ruleName: 'ema_trend_bullish',
      };
    }

    const allBelow = recent5.every((price, i) => price < recentEma5[i]);
    if (allBelow) {
      return {
        signalType: 'SELL',
        confidence: 60,
        reasoning: `Strong downtrend: Price below EMA(20) for 5 consecutive days. Current EMA(20): ${recentEma5[recentEma5.length - 1].toFixed(2)}`,
        ruleName: 'ema_trend_bearish',
      };
    }

    return null;
  }
}
