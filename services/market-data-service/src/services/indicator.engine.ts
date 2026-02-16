import { SMA, EMA, RSI, MACD } from 'technicalindicators';
import type { TechnicalIndicators, MACDValue, OHLCV } from '@platform/shared';

export class IndicatorEngine {
  computeSMA(closePrices: number[], period: number): number | undefined {
    const result = SMA.calculate({ period, values: closePrices });
    return result.length > 0 ? result[result.length - 1] : undefined;
  }

  computeEMA(closePrices: number[], period: number): number | undefined {
    const result = EMA.calculate({ period, values: closePrices });
    return result.length > 0 ? result[result.length - 1] : undefined;
  }

  computeRSI(closePrices: number[], period: number = 14): number | undefined {
    const result = RSI.calculate({ period, values: closePrices });
    return result.length > 0 ? result[result.length - 1] : undefined;
  }

  computeMACD(closePrices: number[]): MACDValue | undefined {
    const result = MACD.calculate({
      values: closePrices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    if (result.length === 0) return undefined;
    const last = result[result.length - 1];
    return {
      macd: last.MACD ?? 0,
      signal: last.signal ?? 0,
      histogram: last.histogram ?? 0,
    };
  }

  computeAll(candles: OHLCV[]): TechnicalIndicators {
    const closes = candles.map((c) => c.close);

    return {
      sma_20: this.computeSMA(closes, 20),
      sma_50: this.computeSMA(closes, 50),
      sma_200: this.computeSMA(closes, 200),
      ema_20: this.computeEMA(closes, 20),
      ema_50: this.computeEMA(closes, 50),
      rsi_14: this.computeRSI(closes, 14),
      macd: this.computeMACD(closes),
    };
  }
}
