import { mean, standardDeviation } from 'simple-statistics';

/**
 * Technical Analysis Tools - Simplified Version
 * Basic technical indicators for testing
 */

/**
 * Calculate Simple Moving Average
 */
export function calculateSMA(prices, period = 20) {
  if (prices.length < period) {
    throw new Error(`Need at least ${period} prices for ${period}-period SMA`);
  }
  
  const sma = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    sma.push({
      index: i,
      price: prices[i],
      sma: mean(window)
    });
  }
  
  return sma;
}

/**
 * Calculate Exponential Moving Average
 */
export function calculateEMA(prices, period = 20) {
  if (prices.length === 0) {
    throw new Error('Cannot calculate EMA with empty price array');
  }
  
  const multiplier = 2 / (period + 1);
  const ema = [];
  
  if (prices.length >= period) {
    const firstSMA = mean(prices.slice(0, period));
    ema.push({
      index: period - 1,
      price: prices[period - 1],
      ema: firstSMA
    });
    
    for (let i = period; i < prices.length; i++) {
      const prevEMA = ema[ema.length - 1].ema;
      const currentEMA = (prices[i] * multiplier) + (prevEMA * (1 - multiplier));
      
      ema.push({
        index: i,
        price: prices[i],
        ema: currentEMA
      });
    }
  }
  
  return ema;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(prices, period = 20, stdMultiplier = 2) {
  if (prices.length < period) {
    throw new Error(`Need at least ${period} prices for Bollinger Bands`);
  }
  
  const bands = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    const sma = mean(window);
    const std = standardDeviation(window);
    
    const upperBand = sma + (stdMultiplier * std);
    const lowerBand = sma - (stdMultiplier * std);
    
    bands.push({
      index: i,
      price: prices[i],
      sma: sma,
      upperBand: upperBand,
      lowerBand: lowerBand,
      bandwidth: (upperBand - lowerBand) / sma,
      position: (prices[i] - lowerBand) / (upperBand - lowerBand)
    });
  }
  
  return bands;
}

/**
 * Calculate RSI - simplified version
 */
export function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) {
    throw new Error(`Need at least ${period + 1} prices for RSI calculation`);
  }
  
  const rsi = [];
  const gains = [];
  const losses = [];
  
  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate average gain and loss
  for (let i = period - 1; i < gains.length; i++) {
    const window = Math.min(period, i + 1);
    const avgGain = mean(gains.slice(Math.max(0, i - period + 1), i + 1));
    const avgLoss = mean(losses.slice(Math.max(0, i - period + 1), i + 1));
    
    const rs = avgGain / (avgLoss || 0.0001);
    const rsiValue = 100 - (100 / (1 + rs));
    
    rsi.push({
      index: i + 1,
      price: prices[i + 1],
      rsi: rsiValue
    });
  }
  
  return rsi;
}

/**
 * Simple MACD calculation
 */
export function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26) {
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  const macdLine = [];
  
  // Find overlap
  const startIndex = Math.max(
    fastEMA[0]?.index || 0, 
    slowEMA[0]?.index || 0
  );
  
  for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
    if (fastEMA[i] && slowEMA[i] && fastEMA[i].index >= startIndex) {
      macdLine.push({
        index: fastEMA[i].index,
        price: prices[fastEMA[i].index],
        macd: fastEMA[i].ema - slowEMA[i].ema,
        signal: null,
        histogram: null
      });
    }
  }
  
  return macdLine;
}

/**
 * Generate simple trading signals
 */
export function generateTradingSignals(prices, options = {}) {
  const signals = [];
  
  if (prices.length < 50) {
    return signals;
  }
  
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  
  for (let i = 1; i < Math.min(sma20.length, sma50.length); i++) {
    const currentPrice = prices[sma20[i].index];
    const prevSMA20 = sma20[i-1]?.sma;
    const currentSMA20 = sma20[i]?.sma;
    const prevSMA50 = sma50[i-1]?.sma;
    const currentSMA50 = sma50[i]?.sma;
    
    let signal = 'HOLD';
    const reasons = [];
    
    if (prevSMA20 && currentSMA20 && prevSMA50 && currentSMA50) {
      if (prevSMA20 <= prevSMA50 && currentSMA20 > currentSMA50) {
        signal = 'BUY';
        reasons.push('Golden Cross');
      } else if (prevSMA20 >= prevSMA50 && currentSMA20 < currentSMA50) {
        signal = 'SELL';
        reasons.push('Death Cross');
      }
    }
    
    signals.push({
      index: sma20[i].index,
      price: currentPrice,
      signal: signal,
      strength: reasons.length,
      reasons: reasons
    });
  }
  
  return signals;
}

/**
 * Calculate trend - simplified
 */
export function calculateTrend(prices, period = 20) {
  const trends = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    const firstPrice = window[0];
    const lastPrice = window[window.length - 1];
    const change = (lastPrice - firstPrice) / firstPrice;
    
    let direction = 'SIDEWAYS';
    if (change > 0.02) {
      direction = 'UPTREND';
    } else if (change < -0.02) {
      direction = 'DOWNTREND';
    }
    
    trends.push({
      index: i,
      price: prices[i],
      direction: direction,
      change: change,
      strength: Math.abs(change)
    });
  }
  
  return trends;
}

/**
 * Find support and resistance - simplified
 */
export function findSupportResistance(prices) {
  // Simple implementation - return empty for now
  return [];
}