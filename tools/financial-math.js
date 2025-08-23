// Financial mathematics utilities for structured products
import { evaluate } from 'mathjs';

// Black-Scholes formula for European options
export function blackScholes(S, K, T, r, sigma, optionType = 'call') {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const N_d1 = normalCDF(d1);
  const N_d2 = normalCDF(d2);
  const N_neg_d1 = normalCDF(-d1);
  const N_neg_d2 = normalCDF(-d2);
  
  if (optionType === 'call') {
    return S * N_d1 - K * Math.exp(-r * T) * N_d2;
  } else {
    return K * Math.exp(-r * T) * N_neg_d2 - S * N_neg_d1;
  }
}

// Calculate option Greeks
export function calculateGreeks(S, K, T, r, sigma, optionType = 'call') {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const N_d1 = normalCDF(d1);
  const N_d2 = normalCDF(d2);
  const n_d1 = normalPDF(d1);
  
  const delta_call = N_d1;
  const delta_put = N_d1 - 1;
  
  const gamma = n_d1 / (S * sigma * Math.sqrt(T));
  const vega = S * n_d1 * Math.sqrt(T) / 100; // Per 1% volatility change
  const theta_call = (-S * n_d1 * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * N_d2) / 365;
  const theta_put = (-S * n_d1 * sigma / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
  
  const rho_call = K * T * Math.exp(-r * T) * N_d2 / 100;
  const rho_put = -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100;
  
  return {
    delta: optionType === 'call' ? delta_call : delta_put,
    gamma: gamma,
    vega: vega,
    theta: optionType === 'call' ? theta_call : theta_put,
    rho: optionType === 'call' ? rho_call : rho_put
  };
}

// Normal cumulative distribution function
export function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

// Normal probability density function
export function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Error function approximation
function erf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
}

// Generate random normal numbers (Box-Muller transform)
export function randomNormal(mean = 0, stdDev = 1) {
  if (randomNormal.hasSpare) {
    randomNormal.hasSpare = false;
    return randomNormal.spare * stdDev + mean;
  }
  
  randomNormal.hasSpare = true;
  const u = Math.random();
  const v = Math.random();
  const mag = stdDev * Math.sqrt(-2.0 * Math.log(u));
  randomNormal.spare = mag * Math.cos(2.0 * Math.PI * v);
  return mag * Math.sin(2.0 * Math.PI * v) + mean;
}

// Simulate geometric Brownian motion path
export function simulateGBM(S0, r, sigma, T, steps) {
  const dt = T / steps;
  const path = [S0];
  
  for (let i = 1; i <= steps; i++) {
    const dW = randomNormal() * Math.sqrt(dt);
    const S_prev = path[i - 1];
    const S_next = S_prev * Math.exp((r - 0.5 * sigma ** 2) * dt + sigma * dW);
    path.push(S_next);
  }
  
  return path;
}

// Calculate payoff for different structured products
export function calculatePayoff(productType, S, K, barrier, options = {}) {
  switch (productType) {
    case 'call':
      return Math.max(S - K, 0);
      
    case 'put':
      return Math.max(K - S, 0);
      
    case 'autocallable':
      // Simplified autocallable: pays coupon if above barrier at expiry
      const coupon = options.coupon || 0.1;
      if (S >= barrier) {
        return 1 + coupon; // Principal + coupon
      } else if (S >= K) {
        return 1; // Just principal
      } else {
        return S / K; // Participation in downside
      }
      
    case 'barrier_option':
      // Down-and-out call
      const knockedOut = options.knockedOut || false;
      if (knockedOut || S <= barrier) {
        return 0;
      }
      return Math.max(S - K, 0);
      
    case 'rainbow_option':
      // Best-of option on multiple underlyings
      const underlyings = options.underlyings || [S];
      const strikes = options.strikes || [K];
      const payoffs = underlyings.map((price, i) => Math.max(price - strikes[i], 0));
      return Math.max(...payoffs);
      
    default:
      return 0;
  }
}

// Statistical functions for analysis
export function calculateStats(data) {
  const n = data.length;
  const mean = data.reduce((sum, x) => sum + x, 0) / n;
  const variance = data.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  
  const sorted = [...data].sort((a, b) => a - b);
  const percentiles = {
    p5: sorted[Math.floor(0.05 * n)],
    p25: sorted[Math.floor(0.25 * n)],
    p50: sorted[Math.floor(0.50 * n)], // median
    p75: sorted[Math.floor(0.75 * n)],
    p95: sorted[Math.floor(0.95 * n)]
  };
  
  return {
    mean,
    stdDev,
    variance,
    min: Math.min(...data),
    max: Math.max(...data),
    percentiles,
    count: n
  };
}