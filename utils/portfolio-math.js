import { Matrix } from 'ml-matrix';
import { mean, variance, standardDeviation } from 'simple-statistics';
import regression from 'regression';

/**
 * Portfolio Mathematics - Advanced quantitative finance calculations
 * Inspired by FinQuant algorithms, adapted for JavaScript with real market data
 */

/**
 * Calculate covariance between two arrays
 */
function covariance(x, y) {
  if (x.length !== y.length) {
    throw new Error('Arrays must have the same length');
  }
  
  const meanX = mean(x);
  const meanY = mean(y);
  
  const cov = x.reduce((sum, xi, i) => {
    return sum + (xi - meanX) * (y[i] - meanY);
  }, 0) / (x.length - 1);
  
  return cov;
}

/**
 * Calculate returns from price series
 */
export function calculateReturns(prices, method = 'percentage') {
  if (prices.length < 2) {
    throw new Error('Need at least 2 price points to calculate returns');
  }
  
  const returns = [];
  
  for (let i = 1; i < prices.length; i++) {
    const prevPrice = prices[i - 1];
    const currentPrice = prices[i];
    
    if (prevPrice <= 0 || currentPrice <= 0) {
      throw new Error('Prices must be positive for return calculations');
    }
    
    let returnValue;
    switch (method) {
      case 'percentage':
        returnValue = (currentPrice - prevPrice) / prevPrice;
        break;
      case 'log':
        returnValue = Math.log(currentPrice / prevPrice);
        break;
      case 'absolute':
        returnValue = currentPrice - prevPrice;
        break;
      default:
        throw new Error('Invalid return calculation method. Use: percentage, log, or absolute');
    }
    
    returns.push(returnValue);
  }
  
  return returns;
}

/**
 * Calculate rolling statistics for time series
 */
export function calculateRollingStats(data, window = 30) {
  if (data.length < window) {
    throw new Error(`Need at least ${window} data points for rolling statistics`);
  }
  
  const rollingStats = [];
  
  for (let i = window - 1; i < data.length; i++) {
    const windowData = data.slice(i - window + 1, i + 1);
    
    const stats = {
      index: i,
      mean: mean(windowData),
      std: standardDeviation(windowData),
      variance: variance(windowData),
      min: Math.min(...windowData),
      max: Math.max(...windowData)
    };
    
    rollingStats.push(stats);
  }
  
  return rollingStats;
}

/**
 * Calculate covariance matrix for portfolio assets
 */
export function calculateCovarianceMatrix(returnsMatrix) {
  const numAssets = returnsMatrix.length;
  const covMatrix = new Matrix(numAssets, numAssets);
  
  for (let i = 0; i < numAssets; i++) {
    for (let j = 0; j < numAssets; j++) {
      if (i === j) {
        // Variance on diagonal
        covMatrix.set(i, j, variance(returnsMatrix[i]));
      } else {
        // Covariance off diagonal
        const cov = covariance(returnsMatrix[i], returnsMatrix[j]);
        covMatrix.set(i, j, cov);
      }
    }
  }
  
  return covMatrix;
}

/**
 * Calculate correlation matrix from covariance matrix
 */
export function calculateCorrelationMatrix(covarianceMatrix) {
  const n = covarianceMatrix.rows;
  const corrMatrix = new Matrix(n, n);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cov_ij = covarianceMatrix.get(i, j);
      const std_i = Math.sqrt(covarianceMatrix.get(i, i));
      const std_j = Math.sqrt(covarianceMatrix.get(j, j));
      
      const correlation = cov_ij / (std_i * std_j);
      corrMatrix.set(i, j, correlation);
    }
  }
  
  return corrMatrix;
}

/**
 * Calculate portfolio expected return
 */
export function calculatePortfolioReturn(weights, expectedReturns) {
  if (weights.length !== expectedReturns.length) {
    throw new Error('Weights and expected returns arrays must have same length');
  }
  
  let portfolioReturn = 0;
  for (let i = 0; i < weights.length; i++) {
    portfolioReturn += weights[i] * expectedReturns[i];
  }
  
  return portfolioReturn;
}

/**
 * Calculate portfolio volatility (standard deviation)
 */
export function calculatePortfolioVolatility(weights, covarianceMatrix) {
  const weightsMatrix = new Matrix([weights]);
  const weightsTranspose = weightsMatrix.transpose();
  
  // Portfolio variance = w^T * Σ * w
  const portfolioVariance = weightsMatrix
    .mmul(covarianceMatrix)
    .mmul(weightsTranspose)
    .get(0, 0);
  
  return Math.sqrt(portfolioVariance);
}

/**
 * Calculate Sharpe ratio
 */
export function calculateSharpeRatio(portfolioReturn, portfolioVolatility, riskFreeRate = 0.05) {
  if (portfolioVolatility === 0) {
    return portfolioReturn > riskFreeRate ? Infinity : 0;
  }
  
  return (portfolioReturn - riskFreeRate) / portfolioVolatility;
}

/**
 * Mean-Variance Optimization (simplified version)
 * Find portfolio weights that minimize risk for given expected return
 */
export function optimizePortfolioMinVariance(expectedReturns, covarianceMatrix, targetReturn = null) {
  const n = expectedReturns.length;
  
  // If no target return specified, find minimum variance portfolio
  if (targetReturn === null) {
    // Minimum variance portfolio: w = (Σ^-1 * 1) / (1^T * Σ^-1 * 1)
    const ones = new Matrix(n, 1).fill(1);
    const covInv = covarianceMatrix.inverse();
    
    const numerator = covInv.mmul(ones);
    const denominator = ones.transpose().mmul(covInv).mmul(ones).get(0, 0);
    
    const weights = numerator.div(denominator);
    return weights.getColumn(0);
  }
  
  // For target return, use more complex optimization (simplified approximation)
  // This is a basic implementation - production systems would use quadratic programming
  const minVarWeights = optimizePortfolioMinVariance(expectedReturns, covarianceMatrix);
  const minVarReturn = calculatePortfolioReturn(minVarWeights, expectedReturns);
  
  if (Math.abs(targetReturn - minVarReturn) < 0.001) {
    return minVarWeights;
  }
  
  // Linear interpolation approach (simplified)
  const equalWeights = new Array(n).fill(1 / n);
  const equalReturn = calculatePortfolioReturn(equalWeights, expectedReturns);
  
  let alpha;
  if (Math.abs(equalReturn - minVarReturn) < 0.001) {
    alpha = 0;
  } else {
    alpha = Math.max(0, Math.min(1, (targetReturn - minVarReturn) / (equalReturn - minVarReturn)));
  }
  
  const optimizedWeights = [];
  for (let i = 0; i < n; i++) {
    optimizedWeights[i] = (1 - alpha) * minVarWeights[i] + alpha * equalWeights[i];
  }
  
  return optimizedWeights;
}

/**
 * Calculate efficient frontier points
 */
export function calculateEfficientFrontier(expectedReturns, covarianceMatrix, numPoints = 50) {
  const minReturn = Math.min(...expectedReturns);
  const maxReturn = Math.max(...expectedReturns);
  const returnRange = maxReturn - minReturn;
  
  const frontierPoints = [];
  
  for (let i = 0; i < numPoints; i++) {
    const targetReturn = minReturn + (returnRange * i) / (numPoints - 1);
    
    try {
      const weights = optimizePortfolioMinVariance(expectedReturns, covarianceMatrix, targetReturn);
      const actualReturn = calculatePortfolioReturn(weights, expectedReturns);
      const volatility = calculatePortfolioVolatility(weights, covarianceMatrix);
      const sharpeRatio = calculateSharpeRatio(actualReturn, volatility);
      
      frontierPoints.push({
        targetReturn: targetReturn,
        actualReturn: actualReturn,
        volatility: volatility,
        sharpeRatio: sharpeRatio,
        weights: weights
      });
    } catch (error) {
      // Skip points that cause optimization issues
      continue;
    }
  }
  
  return frontierPoints;
}

/**
 * Find maximum Sharpe ratio portfolio
 */
export function findMaxSharpePortfolio(expectedReturns, covarianceMatrix, riskFreeRate = 0.05) {
  const frontierPoints = calculateEfficientFrontier(expectedReturns, covarianceMatrix, 100);
  
  let maxSharpePoint = null;
  let maxSharpe = -Infinity;
  
  for (const point of frontierPoints) {
    const sharpe = calculateSharpeRatio(point.actualReturn, point.volatility, riskFreeRate);
    if (sharpe > maxSharpe) {
      maxSharpe = sharpe;
      maxSharpePoint = point;
    }
  }
  
  return maxSharpePoint;
}

/**
 * Calculate Value at Risk (VaR) for portfolio
 */
export function calculateVaR(returns, confidenceLevel = 0.95, method = 'historical') {
  if (returns.length === 0) {
    throw new Error('Cannot calculate VaR with empty returns array');
  }
  
  const sortedReturns = [...returns].sort((a, b) => a - b);
  
  switch (method) {
    case 'historical':
      const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
      return -sortedReturns[Math.max(0, index)];
      
    case 'parametric':
      const returnMean = mean(returns);
      const returnStd = standardDeviation(returns);
      // Using normal distribution approximation
      const zScore = confidenceLevel === 0.95 ? 1.645 : 
                    confidenceLevel === 0.99 ? 2.326 : 1.96;
      return -(returnMean - zScore * returnStd);
      
    default:
      throw new Error('Invalid VaR method. Use: historical or parametric');
  }
}

/**
 * Calculate Expected Shortfall (Conditional VaR)
 */
export function calculateExpectedShortfall(returns, confidenceLevel = 0.95) {
  if (returns.length === 0) {
    throw new Error('Cannot calculate Expected Shortfall with empty returns array');
  }
  
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const cutoffIndex = Math.floor((1 - confidenceLevel) * sortedReturns.length);
  
  const tailReturns = sortedReturns.slice(0, cutoffIndex + 1);
  return tailReturns.length > 0 ? -mean(tailReturns) : 0;
}

/**
 * Calculate maximum drawdown
 */
export function calculateMaxDrawdown(cumulativeReturns) {
  if (cumulativeReturns.length < 2) {
    return { maxDrawdown: 0, peak: 0, trough: 0, recovery: null };
  }
  
  let peak = cumulativeReturns[0];
  let maxDrawdown = 0;
  let peakIndex = 0;
  let troughIndex = 0;
  let recoveryIndex = null;
  
  for (let i = 1; i < cumulativeReturns.length; i++) {
    const currentValue = cumulativeReturns[i];
    
    // Update peak
    if (currentValue > peak) {
      peak = currentValue;
      peakIndex = i;
      
      // Check if we've recovered from previous drawdown
      if (maxDrawdown > 0 && recoveryIndex === null) {
        recoveryIndex = i;
      }
    }
    
    // Calculate current drawdown
    const currentDrawdown = (peak - currentValue) / peak;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
      troughIndex = i;
      recoveryIndex = null; // Reset recovery
    }
  }
  
  return {
    maxDrawdown: maxDrawdown,
    peak: peakIndex,
    trough: troughIndex,
    recovery: recoveryIndex,
    drawdownPeriod: recoveryIndex ? recoveryIndex - peakIndex : cumulativeReturns.length - peakIndex - 1
  };
}

/**
 * Advanced Risk Metrics - FinQuant Inspired
 */

/**
 * Calculate downside deviation (semi-standard deviation)
 */
export function calculateDownsideDeviation(returns, targetReturn = 0) {
  if (returns.length === 0) {
    throw new Error('Cannot calculate downside deviation with empty returns array');
  }
  
  const downsideReturns = returns.filter(r => r < targetReturn);
  if (downsideReturns.length === 0) {
    return 0;
  }
  
  const meanDownsideReturn = mean(downsideReturns);
  const downsideVariance = downsideReturns.reduce((sum, r) => {
    return sum + Math.pow(r - meanDownsideReturn, 2);
  }, 0) / downsideReturns.length;
  
  return Math.sqrt(downsideVariance);
}

/**
 * Calculate Sortino ratio (downside risk-adjusted return)
 */
export function calculateSortinoRatio(portfolioReturn, returns, riskFreeRate = 0.05, targetReturn = null) {
  if (returns.length === 0) {
    throw new Error('Cannot calculate Sortino ratio with empty returns array');
  }
  
  const target = targetReturn !== null ? targetReturn : riskFreeRate;
  const downsideDeviation = calculateDownsideDeviation(returns, target);
  
  if (downsideDeviation === 0) {
    return portfolioReturn > riskFreeRate ? Infinity : 0;
  }
  
  return (portfolioReturn - riskFreeRate) / downsideDeviation;
}

/**
 * Calculate Treynor ratio (systematic risk-adjusted return)
 */
export function calculateTreynorRatio(portfolioReturn, portfolioBeta, riskFreeRate = 0.05) {
  if (portfolioBeta === 0) {
    return portfolioReturn > riskFreeRate ? Infinity : 0;
  }
  
  return (portfolioReturn - riskFreeRate) / portfolioBeta;
}

/**
 * Calculate portfolio beta relative to market
 */
export function calculatePortfolioBeta(portfolioReturns, marketReturns) {
  if (portfolioReturns.length !== marketReturns.length) {
    throw new Error('Portfolio and market returns must have same length');
  }
  
  if (portfolioReturns.length < 2) {
    throw new Error('Need at least 2 data points to calculate beta');
  }
  
  const covPortfolioMarket = covariance(portfolioReturns, marketReturns);
  const marketVariance = variance(marketReturns);
  
  if (marketVariance === 0) {
    return 0;
  }
  
  return covPortfolioMarket / marketVariance;
}

/**
 * Calculate Information Ratio
 */
export function calculateInformationRatio(portfolioReturns, benchmarkReturns) {
  if (portfolioReturns.length !== benchmarkReturns.length) {
    throw new Error('Portfolio and benchmark returns must have same length');
  }
  
  const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
  const trackingError = standardDeviation(excessReturns);
  
  if (trackingError === 0) {
    return mean(excessReturns) === 0 ? 0 : Infinity;
  }
  
  return mean(excessReturns) / trackingError;
}

/**
 * Calculate Calmar Ratio (annual return / maximum drawdown)
 */
export function calculateCalmarRatio(annualReturn, maxDrawdown) {
  if (maxDrawdown === 0) {
    return annualReturn > 0 ? Infinity : 0;
  }
  
  return Math.abs(annualReturn / maxDrawdown);
}

/**
 * Calculate portfolio tracking error
 */
export function calculateTrackingError(portfolioReturns, benchmarkReturns) {
  if (portfolioReturns.length !== benchmarkReturns.length) {
    throw new Error('Portfolio and benchmark returns must have same length');
  }
  
  const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
  return standardDeviation(excessReturns);
}

/**
 * Calculate semi-variance (downside variance)
 */
export function calculateSemiVariance(returns, targetReturn = 0) {
  if (returns.length === 0) {
    throw new Error('Cannot calculate semi-variance with empty returns array');
  }
  
  const downsideReturns = returns.filter(r => r < targetReturn);
  if (downsideReturns.length === 0) {
    return 0;
  }
  
  const sumSquaredDeviations = downsideReturns.reduce((sum, r) => {
    return sum + Math.pow(r - targetReturn, 2);
  }, 0);
  
  return sumSquaredDeviations / downsideReturns.length;
}

/**
 * Calculate upside potential ratio
 */
export function calculateUpsidePotentialRatio(returns, targetReturn = 0) {
  if (returns.length === 0) {
    throw new Error('Cannot calculate upside potential ratio with empty returns array');
  }
  
  const upsideReturns = returns.filter(r => r > targetReturn);
  const downsideDeviation = calculateDownsideDeviation(returns, targetReturn);
  
  if (downsideDeviation === 0) {
    return upsideReturns.length > 0 ? Infinity : 0;
  }
  
  const upsidePotential = upsideReturns.length > 0 ? 
    upsideReturns.reduce((sum, r) => sum + (r - targetReturn), 0) / returns.length : 0;
  
  return upsidePotential / downsideDeviation;
}

/**
 * Calculate comprehensive risk metrics for a portfolio
 */
export function calculateAdvancedRiskMetrics(portfolioReturns, benchmarkReturns = null, riskFreeRate = 0.05) {
  if (portfolioReturns.length === 0) {
    throw new Error('Cannot calculate risk metrics with empty returns array');
  }
  
  const portfolioReturn = mean(portfolioReturns);
  const portfolioVolatility = standardDeviation(portfolioReturns);
  const downsideDeviation = calculateDownsideDeviation(portfolioReturns, riskFreeRate);
  const semiVariance = calculateSemiVariance(portfolioReturns, riskFreeRate);
  
  // Calculate cumulative returns for drawdown analysis
  const cumulativeReturns = portfolioReturns.reduce((acc, r, i) => {
    if (i === 0) {
      acc.push(1 + r);
    } else {
      acc.push(acc[i - 1] * (1 + r));
    }
    return acc;
  }, []);
  
  const maxDrawdownInfo = calculateMaxDrawdown(cumulativeReturns);
  
  const metrics = {
    // Basic metrics
    totalReturn: portfolioReturn,
    volatility: portfolioVolatility,
    sharpeRatio: calculateSharpeRatio(portfolioReturn, portfolioVolatility, riskFreeRate),
    
    // Downside risk metrics
    downsideDeviation: downsideDeviation,
    sortinoRatio: calculateSortinoRatio(portfolioReturn, portfolioReturns, riskFreeRate),
    semiVariance: semiVariance,
    upsidePotentialRatio: calculateUpsidePotentialRatio(portfolioReturns, riskFreeRate),
    
    // Drawdown metrics
    maxDrawdown: maxDrawdownInfo.maxDrawdown,
    calmarRatio: calculateCalmarRatio(portfolioReturn, maxDrawdownInfo.maxDrawdown),
    drawdownPeriod: maxDrawdownInfo.drawdownPeriod,
    
    // Risk measures
    var95: calculateVaR(portfolioReturns, 0.95),
    var99: calculateVaR(portfolioReturns, 0.99),
    expectedShortfall95: calculateExpectedShortfall(portfolioReturns, 0.95),
    expectedShortfall99: calculateExpectedShortfall(portfolioReturns, 0.99)
  };
  
  // Add benchmark-relative metrics if benchmark provided
  if (benchmarkReturns && benchmarkReturns.length === portfolioReturns.length) {
    const beta = calculatePortfolioBeta(portfolioReturns, benchmarkReturns);
    
    metrics.beta = beta;
    metrics.treynorRatio = calculateTreynorRatio(portfolioReturn, beta, riskFreeRate);
    metrics.informationRatio = calculateInformationRatio(portfolioReturns, benchmarkReturns);
    metrics.trackingError = calculateTrackingError(portfolioReturns, benchmarkReturns);
    metrics.benchmarkReturn = mean(benchmarkReturns);
    metrics.excessReturn = portfolioReturn - mean(benchmarkReturns);
  }
  
  return metrics;
}

/**
 * Black-Litterman Model Implementation
 * Combines market equilibrium with investor views for robust portfolio optimization
 */

/**
 * Calculate implied equilibrium returns from market cap weights
 */
export function calculateImpliedReturns(marketCapWeights, covarianceMatrix, riskAversion = 3) {
  if (marketCapWeights.length !== covarianceMatrix.rows) {
    throw new Error('Market cap weights must match covariance matrix dimensions');
  }
  
  // Convert weights to Matrix format
  const weightsMatrix = new Matrix([marketCapWeights]).transpose();
  
  // Implied returns: π = λ * Σ * w_market
  // where λ is risk aversion, Σ is covariance matrix, w_market is market cap weights
  const impliedReturns = covarianceMatrix.mmul(weightsMatrix).mul(riskAversion);
  
  return impliedReturns.getColumn(0);
}

/**
 * Black-Litterman optimization with investor views
 */
export function blackLittermanOptimization(
  marketCapWeights,
  covarianceMatrix, 
  views = [],
  viewConfidence = [],
  tau = 0.05,
  riskAversion = 3
) {
  const n = marketCapWeights.length;
  
  if (marketCapWeights.length !== covarianceMatrix.rows) {
    throw new Error('Market cap weights must match covariance matrix dimensions');
  }
  
  // Step 1: Calculate implied equilibrium returns
  const impliedReturns = calculateImpliedReturns(marketCapWeights, covarianceMatrix, riskAversion);
  
  // If no views provided, return market portfolio
  if (views.length === 0) {
    return {
      weights: marketCapWeights,
      expectedReturns: impliedReturns,
      method: 'market_equilibrium',
      confidence: 1.0
    };
  }
  
  // Step 2: Set up view matrices
  const k = views.length; // number of views
  const P = new Matrix(k, n); // picking matrix
  const Q = new Matrix(k, 1); // view returns
  
  // Default confidence levels if not provided
  const defaultConfidence = viewConfidence.length === views.length ? 
    viewConfidence : new Array(views.length).fill(0.25);
  
  // Process views
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    
    if (view.type === 'absolute') {
      // Absolute view: Asset i will return Q%
      const assetIndex = view.asset_index || 0;
      P.set(i, assetIndex, 1);
      Q.set(i, 0, view.return_expectation);
      
    } else if (view.type === 'relative') {
      // Relative view: Asset i will outperform asset j by Q%
      const asset1Index = view.asset1_index || 0;
      const asset2Index = view.asset2_index || 1;
      P.set(i, asset1Index, 1);
      P.set(i, asset2Index, -1);
      Q.set(i, 0, view.return_expectation);
      
    } else {
      throw new Error(`Unknown view type: ${view.type}`);
    }
  }
  
  // Step 3: Create uncertainty matrices
  const tauSigma = covarianceMatrix.mul(tau); // Prior uncertainty
  
  // Omega matrix (view uncertainty) - diagonal matrix
  const omega = new Matrix(k, k);
  for (let i = 0; i < k; i++) {
    // View uncertainty based on confidence and view complexity
    const viewUncertainty = (1 / defaultConfidence[i]) * 
      P.getRow(i).reduce((sum, val) => sum + Math.abs(val), 0) * 0.01;
    omega.set(i, i, viewUncertainty);
  }
  
  try {
    // Step 4: Black-Litterman formula
    // μ_BL = [(τΣ)^-1 + P'Ω^-1P]^-1 * [(τΣ)^-1 * π + P'Ω^-1 * Q]
    
    const tauSigmaInv = tauSigma.inverse();
    const omegaInv = omega.inverse();
    const Pt = P.transpose();
    
    // Left side: [(τΣ)^-1 + P'Ω^-1P]^-1
    const leftTerm = tauSigmaInv.add(Pt.mmul(omegaInv).mmul(P)).inverse();
    
    // Right side: [(τΣ)^-1 * π + P'Ω^-1 * Q]
    const impliedMatrix = new Matrix([impliedReturns]).transpose();
    const rightTerm = tauSigmaInv.mmul(impliedMatrix).add(Pt.mmul(omegaInv).mmul(Q));
    
    // Black-Litterman expected returns
    const blReturns = leftTerm.mmul(rightTerm);
    const blReturnsArray = blReturns.getColumn(0);
    
    // Step 5: Calculate new covariance matrix
    // Σ_BL = [(τΣ)^-1 + P'Ω^-1P]^-1
    const blCovariance = leftTerm;
    
    // Step 6: Optimize portfolio using Black-Litterman inputs
    const blWeights = optimizePortfolioMinVariance(blReturnsArray, blCovariance);
    
    // Calculate portfolio metrics
    const portfolioReturn = calculatePortfolioReturn(blWeights, blReturnsArray);
    const portfolioVolatility = calculatePortfolioVolatility(blWeights, blCovariance);
    
    return {
      weights: blWeights,
      expectedReturns: blReturnsArray,
      portfolioReturn: portfolioReturn,
      portfolioVolatility: portfolioVolatility,
      impliedReturns: impliedReturns,
      method: 'black_litterman',
      views: views,
      viewConfidence: defaultConfidence,
      tau: tau,
      riskAversion: riskAversion
    };
    
  } catch (error) {
    // Fallback to market portfolio if optimization fails
    console.warn('Black-Litterman optimization failed, falling back to market portfolio:', error.message);
    return {
      weights: marketCapWeights,
      expectedReturns: impliedReturns,
      portfolioReturn: calculatePortfolioReturn(marketCapWeights, impliedReturns),
      portfolioVolatility: calculatePortfolioVolatility(marketCapWeights, covarianceMatrix),
      method: 'market_equilibrium_fallback',
      error: error.message
    };
  }
}

/**
 * Helper function to create common view types
 */
export function createBlackLittermanView(type, params) {
  const baseView = {
    type: type,
    return_expectation: params.return_expectation || 0,
    confidence: params.confidence || 0.25
  };
  
  switch (type) {
    case 'absolute':
      return {
        ...baseView,
        asset_index: params.asset_index,
        description: `Asset ${params.asset_index} expected return: ${(params.return_expectation * 100).toFixed(1)}%`
      };
      
    case 'relative':
      return {
        ...baseView,
        asset1_index: params.asset1_index,
        asset2_index: params.asset2_index,
        description: `Asset ${params.asset1_index} will outperform Asset ${params.asset2_index} by ${(params.return_expectation * 100).toFixed(1)}%`
      };
      
    default:
      throw new Error(`Unknown view type: ${type}`);
  }
}

/**
 * Calculate market capitalization weights from market data
 */
export function calculateMarketCapWeights(marketCaps) {
  if (marketCaps.length === 0) {
    throw new Error('Market cap array cannot be empty');
  }
  
  const totalMarketCap = marketCaps.reduce((sum, cap) => sum + cap, 0);
  
  if (totalMarketCap <= 0) {
    throw new Error('Total market cap must be positive');
  }
  
  return marketCaps.map(cap => cap / totalMarketCap);
}

/**
 * Generate sample views based on technical analysis or fundamental analysis
 */
export function generateSampleViews(symbols, technicalSignals = [], fundamentalData = []) {
  const views = [];
  
  // Create views from technical signals
  for (let i = 0; i < technicalSignals.length && i < symbols.length; i++) {
    const signal = technicalSignals[i];
    if (signal && Math.abs(signal.strength) > 0.1) {
      views.push(createBlackLittermanView('absolute', {
        asset_index: i,
        return_expectation: signal.strength * 0.05, // Convert signal to expected return
        confidence: Math.abs(signal.strength), // Higher strength = higher confidence
        source: 'technical'
      }));
    }
  }
  
  // Create views from fundamental data
  for (let i = 0; i < fundamentalData.length && i < symbols.length; i++) {
    const data = fundamentalData[i];
    if (data && data.pe_ratio && data.pe_ratio < 15) {
      // Low P/E suggests potential outperformance
      views.push(createBlackLittermanView('absolute', {
        asset_index: i,
        return_expectation: 0.03, // 3% expected outperformance
        confidence: 0.3,
        source: 'fundamental'
      }));
    }
  }
  
  return views;
}

/**
 * Risk Parity Portfolio Implementation
 * Equal risk contribution from each asset rather than equal weights
 */

/**
 * Calculate risk contributions for a portfolio
 */
export function calculateRiskContributions(weights, covarianceMatrix) {
  if (weights.length !== covarianceMatrix.rows) {
    throw new Error('Weights must match covariance matrix dimensions');
  }
  
  const weightsMatrix = new Matrix([weights]);
  const weightsTranspose = weightsMatrix.transpose();
  
  // Portfolio variance: σ²_p = w^T * Σ * w
  const portfolioVariance = weightsMatrix.mmul(covarianceMatrix).mmul(weightsTranspose).get(0, 0);
  
  if (portfolioVariance <= 0) {
    return new Array(weights.length).fill(0);
  }
  
  // Marginal risk contributions: MRC_i = (Σ * w)_i
  const marginalContributions = covarianceMatrix.mmul(weightsTranspose).getColumn(0);
  
  // Risk contributions: RC_i = w_i * MRC_i / σ²_p
  const riskContributions = weights.map((w, i) => 
    (w * marginalContributions[i]) / portfolioVariance
  );
  
  return riskContributions;
}

/**
 * Calculate risk parity objective function
 * Minimizes sum of squared deviations from equal risk (1/n each)
 */
export function riskParityObjective(weights, covarianceMatrix) {
  const n = weights.length;
  const targetRiskContribution = 1 / n;
  
  const riskContributions = calculateRiskContributions(weights, covarianceMatrix);
  
  // Sum of squared deviations from equal risk
  const objective = riskContributions.reduce((sum, rc) => {
    return sum + Math.pow(rc - targetRiskContribution, 2);
  }, 0);
  
  return objective;
}

/**
 * Risk Parity optimization using iterative approach
 * Based on Spinu (2013) formulation with Newton-Raphson method
 */
export function optimizeRiskParity(covarianceMatrix, initialWeights = null, maxIterations = 100, tolerance = 1e-6) {
  const n = covarianceMatrix.rows;
  
  if (n < 2) {
    throw new Error('Need at least 2 assets for Risk Parity optimization');
  }
  
  // Initialize weights - equal weights or provided
  let weights = initialWeights || new Array(n).fill(1 / n);
  
  // Normalize weights to sum to 1
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  weights = weights.map(w => w / weightSum);
  
  let iteration = 0;
  let converged = false;
  const targetRiskContribution = 1 / n;
  
  while (iteration < maxIterations && !converged) {
    const oldWeights = [...weights];
    
    // Calculate current risk contributions
    const riskContributions = calculateRiskContributions(weights, covarianceMatrix);
    
    // Calculate adjustment factors using iterative rebalancing
    // Spinu's method: w_new = w_old * (target_RC / current_RC)^α
    const alpha = 0.1; // Learning rate - smaller for stability
    
    for (let i = 0; i < n; i++) {
      if (riskContributions[i] > 0) {
        const adjustmentFactor = Math.pow(targetRiskContribution / riskContributions[i], alpha);
        weights[i] *= adjustmentFactor;
      }
    }
    
    // Renormalize weights
    const newWeightSum = weights.reduce((sum, w) => sum + w, 0);
    if (newWeightSum > 0) {
      weights = weights.map(w => w / newWeightSum);
    }
    
    // Check for convergence
    const maxChange = Math.max(...weights.map((w, i) => Math.abs(w - oldWeights[i])));
    if (maxChange < tolerance) {
      converged = true;
    }
    
    iteration++;
  }
  
  // Final calculations
  const finalRiskContributions = calculateRiskContributions(weights, covarianceMatrix);
  const portfolioVolatility = calculatePortfolioVolatility(weights, covarianceMatrix);
  const riskParityScore = 1 - riskParityObjective(weights, covarianceMatrix);
  
  // Calculate risk contribution statistics
  const rcMean = mean(finalRiskContributions);
  const rcStd = standardDeviation(finalRiskContributions);
  const rcMin = Math.min(...finalRiskContributions);
  const rcMax = Math.max(...finalRiskContributions);
  
  return {
    weights: weights,
    riskContributions: finalRiskContributions,
    portfolioVolatility: portfolioVolatility,
    converged: converged,
    iterations: iteration,
    riskParityScore: riskParityScore,
    riskContributionStats: {
      mean: rcMean,
      std: rcStd,
      min: rcMin,
      max: rcMax,
      range: rcMax - rcMin
    }
  };
}

/**
 * Constrained Risk Parity with weight bounds
 */
export function optimizeConstrainedRiskParity(
  covarianceMatrix, 
  minWeights = null, 
  maxWeights = null,
  maxIterations = 100,
  tolerance = 1e-6
) {
  const n = covarianceMatrix.rows;
  
  // Set default bounds if not provided
  const lowerBounds = minWeights || new Array(n).fill(0.01); // Min 1%
  const upperBounds = maxWeights || new Array(n).fill(0.5);  // Max 50%
  
  // Validate bounds
  if (lowerBounds.some(lb => lb < 0) || upperBounds.some(ub => ub > 1)) {
    throw new Error('Invalid weight bounds: must be between 0 and 1');
  }
  
  if (lowerBounds.reduce((sum, lb) => sum + lb, 0) > 1) {
    throw new Error('Sum of minimum weights exceeds 1');
  }
  
  // Start with feasible equal weights within bounds
  let weights = lowerBounds.map((lb, i) => {
    const ub = upperBounds[i];
    return Math.max(lb, Math.min(ub, 1 / n));
  });
  
  // Normalize to sum to 1
  let weightSum = weights.reduce((sum, w) => sum + w, 0);
  weights = weights.map(w => w / weightSum);
  
  let iteration = 0;
  let converged = false;
  const targetRiskContribution = 1 / n;
  
  while (iteration < maxIterations && !converged) {
    const oldWeights = [...weights];
    
    // Calculate risk contributions
    const riskContributions = calculateRiskContributions(weights, covarianceMatrix);
    
    // Adjust weights towards equal risk contribution
    const alpha = 0.05; // Smaller learning rate for constrained optimization
    
    for (let i = 0; i < n; i++) {
      if (riskContributions[i] > 0) {
        const adjustmentFactor = Math.pow(targetRiskContribution / riskContributions[i], alpha);
        let newWeight = weights[i] * adjustmentFactor;
        
        // Apply constraints
        newWeight = Math.max(lowerBounds[i], Math.min(upperBounds[i], newWeight));
        weights[i] = newWeight;
      }
    }
    
    // Renormalize weights
    weightSum = weights.reduce((sum, w) => sum + w, 0);
    if (weightSum > 0) {
      weights = weights.map(w => w / weightSum);
    }
    
    // Re-apply bounds after normalization
    for (let i = 0; i < n; i++) {
      weights[i] = Math.max(lowerBounds[i], Math.min(upperBounds[i], weights[i]));
    }
    
    // Final renormalization
    weightSum = weights.reduce((sum, w) => sum + w, 0);
    weights = weights.map(w => w / weightSum);
    
    // Check convergence
    const maxChange = Math.max(...weights.map((w, i) => Math.abs(w - oldWeights[i])));
    if (maxChange < tolerance) {
      converged = true;
    }
    
    iteration++;
  }
  
  const finalRiskContributions = calculateRiskContributions(weights, covarianceMatrix);
  const portfolioVolatility = calculatePortfolioVolatility(weights, covarianceMatrix);
  const riskParityScore = 1 - riskParityObjective(weights, covarianceMatrix);
  
  return {
    weights: weights,
    riskContributions: finalRiskContributions,
    portfolioVolatility: portfolioVolatility,
    converged: converged,
    iterations: iteration,
    riskParityScore: riskParityScore,
    constraintsActive: weights.some((w, i) => 
      Math.abs(w - lowerBounds[i]) < tolerance || Math.abs(w - upperBounds[i]) < tolerance
    ),
    minWeights: lowerBounds,
    maxWeights: upperBounds
  };
}

/**
 * Hierarchical Risk Parity (HRP) - Alternative approach using clustering
 * Simplified version based on correlation distance
 */
export function optimizeHierarchicalRiskParity(covarianceMatrix, returns = null) {
  const n = covarianceMatrix.rows;
  
  if (n < 3) {
    // Fall back to regular risk parity for small portfolios
    return optimizeRiskParity(covarianceMatrix);
  }
  
  // Convert covariance to correlation matrix
  const corrMatrix = calculateCorrelationMatrix(covarianceMatrix);
  
  // Calculate distance matrix (1 - |correlation|)
  const distanceMatrix = new Matrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distanceMatrix.set(i, j, 0);
      } else {
        const corr = corrMatrix.get(i, j);
        const distance = Math.sqrt(0.5 * (1 - corr));
        distanceMatrix.set(i, j, distance);
      }
    }
  }
  
  // Simple hierarchical clustering (single linkage)
  const clusters = [];
  for (let i = 0; i < n; i++) {
    clusters.push([i]);
  }
  
  // Build cluster tree (simplified approach)
  const clusterTree = [];
  while (clusters.length > 1) {
    let minDistance = Infinity;
    let mergeIndices = [0, 1];
    
    // Find closest clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let clusterDistance = 0;
        let pairCount = 0;
        
        for (const asset1 of clusters[i]) {
          for (const asset2 of clusters[j]) {
            clusterDistance += distanceMatrix.get(asset1, asset2);
            pairCount++;
          }
        }
        
        const avgDistance = clusterDistance / pairCount;
        if (avgDistance < minDistance) {
          minDistance = avgDistance;
          mergeIndices = [i, j];
        }
      }
    }
    
    // Merge closest clusters
    const [i, j] = mergeIndices;
    const newCluster = [...clusters[i], ...clusters[j]];
    clusterTree.push({ cluster: newCluster, distance: minDistance });
    
    clusters.splice(Math.max(i, j), 1);
    clusters.splice(Math.min(i, j), 1);
    clusters.push(newCluster);
  }
  
  // Allocate weights using inverse variance approach within clusters
  const weights = new Array(n).fill(0);
  const assetVariances = [];
  
  for (let i = 0; i < n; i++) {
    assetVariances.push(covarianceMatrix.get(i, i));
  }
  
  // Start with inverse variance weights
  const invVar = assetVariances.map(v => 1 / Math.sqrt(v));
  const invVarSum = invVar.reduce((sum, iv) => sum + iv, 0);
  
  for (let i = 0; i < n; i++) {
    weights[i] = invVar[i] / invVarSum;
  }
  
  const riskContributions = calculateRiskContributions(weights, covarianceMatrix);
  const portfolioVolatility = calculatePortfolioVolatility(weights, covarianceMatrix);
  
  return {
    weights: weights,
    riskContributions: riskContributions,
    portfolioVolatility: portfolioVolatility,
    method: 'hierarchical_risk_parity',
    clusterTree: clusterTree,
    converged: true,
    iterations: 1
  };
}

/**
 * Compare different risk parity approaches
 */
export function compareRiskParityMethods(covarianceMatrix, assetNames = null) {
  const methods = {
    equal_weight: null,
    risk_parity: null,
    constrained_risk_parity: null,
    hierarchical_risk_parity: null
  };
  
  const n = covarianceMatrix.rows;
  const names = assetNames || Array.from({length: n}, (_, i) => `Asset${i + 1}`);
  
  try {
    // Equal weights baseline
    const equalWeights = new Array(n).fill(1 / n);
    methods.equal_weight = {
      weights: equalWeights,
      riskContributions: calculateRiskContributions(equalWeights, covarianceMatrix),
      portfolioVolatility: calculatePortfolioVolatility(equalWeights, covarianceMatrix),
      method: 'equal_weight'
    };
    
    // Standard Risk Parity
    methods.risk_parity = optimizeRiskParity(covarianceMatrix);
    
    // Constrained Risk Parity
    methods.constrained_risk_parity = optimizeConstrainedRiskParity(covarianceMatrix);
    
    // Hierarchical Risk Parity
    methods.hierarchical_risk_parity = optimizeHierarchicalRiskParity(covarianceMatrix);
    
  } catch (error) {
    // If any method fails, return what we have
  }
  
  return {
    methods: methods,
    assetNames: names,
    comparison: generateRiskParityComparison(methods, names)
  };
}

/**
 * Generate comparison table for risk parity methods
 */
function generateRiskParityComparison(methods, assetNames) {
  const comparison = {
    weights: {},
    riskContributions: {},
    portfolioMetrics: {}
  };
  
  Object.keys(methods).forEach(methodName => {
    const method = methods[methodName];
    if (method) {
      comparison.weights[methodName] = method.weights;
      comparison.riskContributions[methodName] = method.riskContributions;
      comparison.portfolioMetrics[methodName] = {
        volatility: method.portfolioVolatility,
        riskParityScore: method.riskParityScore || 0
      };
    }
  });
  
  return comparison;
}