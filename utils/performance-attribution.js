import { mean, standardDeviation } from 'simple-statistics';
import { calculateReturns } from './portfolio-math.js';

/**
 * Performance Attribution Analysis
 * Implementation of Brinson-Fachler methodology with modern enhancements
 * Based on 2024 academic research and industry best practices
 */

/**
 * Brinson Attribution Result
 */
export class BrinsonAttributionResult {
  constructor() {
    this.allocationEffect = {};      // Sector/asset allocation effects
    this.selectionEffect = {};       // Security selection effects  
    this.interactionEffect = {};     // Interaction effects
    this.totalActiveReturn = 0;      // Total portfolio excess return
    this.totalAllocationEffect = 0;  // Sum of allocation effects
    this.totalSelectionEffect = 0;   // Sum of selection effects
    this.totalInteractionEffect = 0; // Sum of interaction effects
    this.unexplainedReturn = 0;      // Residual unexplained return
    this.periods = [];               // Multi-period results
  }
}

/**
 * Factor-Based Attribution Result
 * Modern alternative to traditional Brinson attribution
 */
export class FactorAttributionResult {
  constructor() {
    this.factorReturns = {};         // Return attribution by factor
    this.factorRisks = {};           // Risk attribution by factor
    this.specificReturn = 0;         // Stock-specific alpha
    this.totalActiveReturn = 0;      // Total excess return
    this.factorBetas = {};           // Factor exposures
    this.rSquared = 0;               // Model explanatory power
  }
}

/**
 * Multi-Period Attribution Result using Frongello Method
 */
export class MultiPeriodAttributionResult {
  constructor() {
    this.periods = [];               // Individual period results
    this.geometricLinking = {};      // Geometrically linked effects
    this.arithmeticSum = {};         // Simple arithmetic sum
    this.compounding = {};           // Compounding effects
    this.totalReturn = {};           // Total multi-period effects
  }
}

/**
 * Brinson Performance Attribution Engine
 */
export class BrinsonAttribution {
  constructor() {
    this.sectors = [];
    this.portfolioWeights = {};
    this.benchmarkWeights = {};
    this.portfolioReturns = {};
    this.benchmarkReturns = {};
    this.sectorReturns = {};
  }
  
  /**
   * Initialize attribution analysis with portfolio and benchmark data
   */
  initialize(config) {
    this.sectors = config.sectors || [];
    this.portfolioWeights = config.portfolioWeights || {};
    this.benchmarkWeights = config.benchmarkWeights || {};
    this.portfolioReturns = config.portfolioReturns || {};
    this.benchmarkReturns = config.benchmarkReturns || {};
    this.sectorReturns = config.sectorReturns || {};
    
    this.validateInputs();
  }
  
  /**
   * Calculate single-period Brinson attribution
   */
  calculateSinglePeriodAttribution() {
    const result = new BrinsonAttributionResult();
    
    // Calculate effects for each sector
    this.sectors.forEach(sector => {
      const wp = this.portfolioWeights[sector] || 0;    // Portfolio weight
      const wb = this.benchmarkWeights[sector] || 0;     // Benchmark weight
      const rp = this.portfolioReturns[sector] || 0;     // Portfolio sector return
      const rb = this.benchmarkReturns[sector] || 0;     // Benchmark sector return
      const rs = this.sectorReturns[sector] || rb;       // Sector return (default to benchmark)
      
      // Brinson-Fachler Attribution Effects
      // Allocation Effect: (wp - wb) * (rs - rbenchmark_total)
      const benchmarkTotalReturn = this.calculateBenchmarkTotalReturn();
      const allocationEffect = (wp - wb) * (rs - benchmarkTotalReturn);
      
      // Selection Effect: wb * (rp - rs)  
      const selectionEffect = wb * (rp - rs);
      
      // Interaction Effect: (wp - wb) * (rp - rs)
      const interactionEffect = (wp - wb) * (rp - rs);
      
      result.allocationEffect[sector] = allocationEffect;
      result.selectionEffect[sector] = selectionEffect;
      result.interactionEffect[sector] = interactionEffect;
      
      result.totalAllocationEffect += allocationEffect;
      result.totalSelectionEffect += selectionEffect;
      result.totalInteractionEffect += interactionEffect;
    });
    
    // Calculate total active return
    const portfolioTotalReturn = this.calculatePortfolioTotalReturn();
    const benchmarkTotalReturn = this.calculateBenchmarkTotalReturn();
    result.totalActiveReturn = portfolioTotalReturn - benchmarkTotalReturn;
    
    // Calculate unexplained return (should be close to zero if attribution is accurate)
    result.unexplainedReturn = result.totalActiveReturn - 
      (result.totalAllocationEffect + result.totalSelectionEffect + result.totalInteractionEffect);
    
    return result;
  }
  
  /**
   * Calculate multi-period attribution using Frongello method
   */
  calculateMultiPeriodAttribution(periodsData) {
    const result = new MultiPeriodAttributionResult();
    
    // Calculate attribution for each period
    periodsData.forEach((periodData, index) => {
      this.initialize(periodData);
      const periodResult = this.calculateSinglePeriodAttribution();
      periodResult.period = index;
      result.periods.push(periodResult);
    });
    
    // Apply Frongello geometric linking
    result.geometricLinking = this.applyFrongelloLinking(result.periods);
    
    // Simple arithmetic sum for comparison
    result.arithmeticSum = this.calculateArithmeticSum(result.periods);
    
    return result;
  }
  
  /**
   * Frongello geometric linking method for multi-period attribution
   */
  applyFrongelloLinking(periods) {
    if (periods.length <= 1) {
      return periods[0] || new BrinsonAttributionResult();
    }
    
    const linked = new BrinsonAttributionResult();
    
    // Initialize with first period
    let cumulativePortfolioReturn = 1 + periods[0].totalActiveReturn + this.calculateBenchmarkTotalReturn();
    let cumulativeBenchmarkReturn = 1 + this.calculateBenchmarkTotalReturn();
    
    linked.totalAllocationEffect = periods[0].totalAllocationEffect;
    linked.totalSelectionEffect = periods[0].totalSelectionEffect;
    linked.totalInteractionEffect = periods[0].totalInteractionEffect;
    
    // Link subsequent periods geometrically
    for (let i = 1; i < periods.length; i++) {
      const period = periods[i];
      
      // Update cumulative returns
      const periodBenchmarkReturn = this.calculateBenchmarkTotalReturn();
      cumulativePortfolioReturn *= (1 + period.totalActiveReturn + periodBenchmarkReturn);
      cumulativeBenchmarkReturn *= (1 + periodBenchmarkReturn);
      
      // Geometric linking of effects
      const linkingFactor = cumulativeBenchmarkReturn;
      
      linked.totalAllocationEffect = (1 + linked.totalAllocationEffect) * 
        (1 + period.totalAllocationEffect / linkingFactor) - 1;
      
      linked.totalSelectionEffect = (1 + linked.totalSelectionEffect) * 
        (1 + period.totalSelectionEffect / linkingFactor) - 1;
      
      linked.totalInteractionEffect = (1 + linked.totalInteractionEffect) * 
        (1 + period.totalInteractionEffect / linkingFactor) - 1;
    }
    
    linked.totalActiveReturn = (cumulativePortfolioReturn / cumulativeBenchmarkReturn) - 1;
    
    return linked;
  }
  
  /**
   * Calculate arithmetic sum (for comparison with geometric linking)
   */
  calculateArithmeticSum(periods) {
    const sum = new BrinsonAttributionResult();
    
    periods.forEach(period => {
      sum.totalAllocationEffect += period.totalAllocationEffect;
      sum.totalSelectionEffect += period.totalSelectionEffect;
      sum.totalInteractionEffect += period.totalInteractionEffect;
      sum.totalActiveReturn += period.totalActiveReturn;
    });
    
    return sum;
  }
  
  /**
   * Calculate portfolio total return
   */
  calculatePortfolioTotalReturn() {
    let totalReturn = 0;
    this.sectors.forEach(sector => {
      const weight = this.portfolioWeights[sector] || 0;
      const sectorReturn = this.portfolioReturns[sector] || 0;
      totalReturn += weight * sectorReturn;
    });
    return totalReturn;
  }
  
  /**
   * Calculate benchmark total return
   */
  calculateBenchmarkTotalReturn() {
    let totalReturn = 0;
    this.sectors.forEach(sector => {
      const weight = this.benchmarkWeights[sector] || 0;
      const sectorReturn = this.benchmarkReturns[sector] || 0;
      totalReturn += weight * sectorReturn;
    });
    return totalReturn;
  }
  
  /**
   * Validate inputs
   */
  validateInputs() {
    // Check that weights sum to approximately 1
    const portfolioWeightSum = Object.values(this.portfolioWeights).reduce((sum, w) => sum + w, 0);
    const benchmarkWeightSum = Object.values(this.benchmarkWeights).reduce((sum, w) => sum + w, 0);
    
    if (Math.abs(portfolioWeightSum - 1.0) > 0.01) {
      console.warn(`Portfolio weights sum to ${portfolioWeightSum.toFixed(3)}, not 1.0`);
    }
    
    if (Math.abs(benchmarkWeightSum - 1.0) > 0.01) {
      console.warn(`Benchmark weights sum to ${benchmarkWeightSum.toFixed(3)}, not 1.0`);
    }
  }
}

/**
 * Factor-Based Performance Attribution
 * Modern alternative to Brinson attribution for factor-based portfolios
 */
export class FactorAttribution {
  constructor() {
    this.factors = [];              // List of risk factors (e.g., 'market', 'size', 'value')
    this.factorReturns = {};        // Factor returns for the period
    this.portfolioBetas = {};       // Portfolio exposures to each factor
    this.benchmarkBetas = {};       // Benchmark exposures to each factor
  }
  
  /**
   * Initialize factor attribution analysis
   */
  initialize(config) {
    this.factors = config.factors || [];
    this.factorReturns = config.factorReturns || {};
    this.portfolioBetas = config.portfolioBetas || {};
    this.benchmarkBetas = config.benchmarkBetas || {};
    this.portfolioReturn = config.portfolioReturn || 0;
    this.benchmarkReturn = config.benchmarkReturn || 0;
    this.riskFreeRate = config.riskFreeRate || 0;
  }
  
  /**
   * Calculate factor-based attribution
   */
  calculateFactorAttribution() {
    const result = new FactorAttributionResult();
    
    result.totalActiveReturn = this.portfolioReturn - this.benchmarkReturn;
    let explainedReturn = 0;
    
    // Calculate attribution for each factor
    this.factors.forEach(factor => {
      const portfolioBeta = this.portfolioBetas[factor] || 0;
      const benchmarkBeta = this.benchmarkBetas[factor] || 0;
      const factorReturn = this.factorReturns[factor] || 0;
      
      // Factor attribution = (Portfolio Beta - Benchmark Beta) * Factor Return
      const factorAttribution = (portfolioBeta - benchmarkBeta) * factorReturn;
      
      result.factorReturns[factor] = factorAttribution;
      result.factorBetas[factor] = portfolioBeta - benchmarkBeta;
      
      explainedReturn += factorAttribution;
    });
    
    // Specific return (alpha) = Total Active Return - Sum of Factor Returns
    result.specificReturn = result.totalActiveReturn - explainedReturn;
    
    // Calculate R-squared (explanatory power of factor model)
    result.rSquared = explainedReturn !== 0 ? 
      Math.pow(explainedReturn / result.totalActiveReturn, 2) : 0;
    
    return result;
  }
  
  /**
   * Calculate risk attribution (risk decomposition by factors)
   */
  calculateRiskAttribution(factorCovariances) {
    const result = {};
    let totalRisk = 0;
    
    // Calculate factor risk contributions
    this.factors.forEach(factor1 => {
      const beta1 = this.portfolioBetas[factor1] || 0;
      let factorRisk = 0;
      
      this.factors.forEach(factor2 => {
        const beta2 = this.portfolioBetas[factor2] || 0;
        const covariance = factorCovariances[factor1]?.[factor2] || 0;
        factorRisk += beta1 * beta2 * covariance;
      });
      
      result[factor1] = factorRisk;
      totalRisk += factorRisk;
    });
    
    // Normalize to get risk contributions as percentages
    Object.keys(result).forEach(factor => {
      result[factor] = totalRisk > 0 ? result[factor] / totalRisk : 0;
    });
    
    return result;
  }
}

/**
 * Integrated Attribution Analysis Engine
 * Combines Brinson and Factor attribution with modern enhancements
 */
export class IntegratedAttributionEngine {
  constructor() {
    this.brinsonAttribution = new BrinsonAttribution();
    this.factorAttribution = new FactorAttribution();
  }
  
  /**
   * Run comprehensive attribution analysis
   */
  async runComprehensiveAttribution(portfolioData, benchmarkData, config = {}) {
    const results = {
      brinson: null,
      factor: null,
      multiPeriod: null,
      summary: null
    };
    
    try {
      // Brinson Attribution
      if (config.includeBrinson !== false) {
        results.brinson = await this.runBrinsonAttribution(portfolioData, benchmarkData);
      }
      
      // Factor Attribution  
      if (config.includeFactor && config.factorData) {
        results.factor = await this.runFactorAttribution(portfolioData, benchmarkData, config.factorData);
      }
      
      // Multi-period analysis
      if (config.includeMultiPeriod && config.periodsData) {
        results.multiPeriod = await this.runMultiPeriodAttribution(config.periodsData);
      }
      
      // Generate summary
      results.summary = this.generateAttributionSummary(results);
      
    } catch (error) {
      console.error('Attribution analysis failed:', error);
      throw error;
    }
    
    return results;
  }
  
  /**
   * Run Brinson attribution analysis
   */
  async runBrinsonAttribution(portfolioData, benchmarkData) {
    // Extract sectors from portfolio and benchmark data
    const sectors = Array.from(new Set([
      ...Object.keys(portfolioData.weights || {}),
      ...Object.keys(benchmarkData.weights || {})
    ]));
    
    const config = {
      sectors: sectors,
      portfolioWeights: portfolioData.weights || {},
      benchmarkWeights: benchmarkData.weights || {},
      portfolioReturns: portfolioData.sectorReturns || {},
      benchmarkReturns: benchmarkData.sectorReturns || {},
      sectorReturns: benchmarkData.sectorReturns || {}
    };
    
    this.brinsonAttribution.initialize(config);
    return this.brinsonAttribution.calculateSinglePeriodAttribution();
  }
  
  /**
   * Run factor attribution analysis
   */
  async runFactorAttribution(portfolioData, benchmarkData, factorData) {
    const config = {
      factors: factorData.factors || [],
      factorReturns: factorData.factorReturns || {},
      portfolioBetas: portfolioData.factorBetas || {},
      benchmarkBetas: benchmarkData.factorBetas || {},
      portfolioReturn: portfolioData.totalReturn || 0,
      benchmarkReturn: benchmarkData.totalReturn || 0,
      riskFreeRate: factorData.riskFreeRate || 0.05
    };
    
    this.factorAttribution.initialize(config);
    return this.factorAttribution.calculateFactorAttribution();
  }
  
  /**
   * Run multi-period attribution
   */
  async runMultiPeriodAttribution(periodsData) {
    return this.brinsonAttribution.calculateMultiPeriodAttribution(periodsData);
  }
  
  /**
   * Generate attribution summary with key insights
   */
  generateAttributionSummary(results) {
    const summary = {
      totalActiveReturn: 0,
      primaryDrivers: [],
      attributionBreakdown: {},
      insights: [],
      recommendations: []
    };
    
    // Extract key metrics
    if (results.brinson) {
      summary.totalActiveReturn = results.brinson.totalActiveReturn;
      summary.attributionBreakdown.allocation = results.brinson.totalAllocationEffect;
      summary.attributionBreakdown.selection = results.brinson.totalSelectionEffect;
      summary.attributionBreakdown.interaction = results.brinson.totalInteractionEffect;
      
      // Identify primary drivers
      const allocationMagnitude = Math.abs(results.brinson.totalAllocationEffect);
      const selectionMagnitude = Math.abs(results.brinson.totalSelectionEffect);
      
      if (allocationMagnitude > selectionMagnitude) {
        summary.primaryDrivers.push('Asset Allocation');
        summary.insights.push('Performance primarily driven by allocation decisions');
      } else {
        summary.primaryDrivers.push('Security Selection');
        summary.insights.push('Performance primarily driven by security selection');
      }
    }
    
    if (results.factor) {
      summary.attributionBreakdown.factorExposure = results.factor.totalActiveReturn - results.factor.specificReturn;
      summary.attributionBreakdown.alpha = results.factor.specificReturn;
      
      // Identify significant factor exposures
      Object.entries(results.factor.factorReturns).forEach(([factor, contribution]) => {
        if (Math.abs(contribution) > 0.005) { // 0.5% threshold
          summary.primaryDrivers.push(`${factor} factor`);
        }
      });
      
      if (results.factor.specificReturn > 0.01) {
        summary.insights.push('Positive alpha generation from stock selection');
      } else if (results.factor.specificReturn < -0.01) {
        summary.insights.push('Negative alpha from stock selection');
      }
    }
    
    // Generate recommendations
    this.generateRecommendations(summary, results);
    
    return summary;
  }
  
  /**
   * Generate actionable recommendations based on attribution results
   */
  generateRecommendations(summary, results) {
    // Based on Brinson results
    if (results.brinson) {
      const allocation = results.brinson.totalAllocationEffect;
      const selection = results.brinson.totalSelectionEffect;
      
      if (Math.abs(allocation) > Math.abs(selection) * 2) {
        if (allocation > 0) {
          summary.recommendations.push('Continue successful allocation strategy');
        } else {
          summary.recommendations.push('Review and adjust asset allocation decisions');
        }
      }
      
      if (Math.abs(selection) > Math.abs(allocation) * 2) {
        if (selection > 0) {
          summary.recommendations.push('Maintain security selection process');
        } else {
          summary.recommendations.push('Enhance security selection methodology');
        }
      }
    }
    
    // Based on factor results
    if (results.factor) {
      if (results.factor.rSquared < 0.3) {
        summary.recommendations.push('Consider additional risk factors for better explanation');
      }
      
      if (results.factor.specificReturn < -0.02) {
        summary.recommendations.push('Review individual security selection for alpha improvement');
      }
    }
    
    // General recommendations
    if (summary.totalActiveReturn < 0) {
      summary.recommendations.push('Analyze negative performance drivers and consider strategy adjustments');
    }
    
    if (summary.primaryDrivers.length === 0) {
      summary.recommendations.push('Performance attribution is inconclusive - review methodology');
    }
  }
}