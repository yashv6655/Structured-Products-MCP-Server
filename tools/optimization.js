import { calculatePayoff, blackScholes, simulateGBM, calculateStats } from './financial-math.js';
import marketData from '../services/market-data.js';
import MarketCalculations from '../utils/market-calculations.js';

export async function optimizeStructure(args) {
  try {
    const {
      product_type,
      underlying_price,
      volatility,
      target_return,
      time_to_expiry,
      risk_tolerance = 0.5,
      risk_free_rate,
      constraints = {},
      symbol, // NEW: Stock symbol for real market data
      use_market_data = false, // NEW: Flag to use real market data
      dividend_yield, // NEW: Dividend yield
      market_regime_aware = false // NEW: Consider market volatility regime
    } = args;

    let finalUnderlyingPrice = underlying_price;
    let finalVolatility = volatility;
    let finalRiskFreeRate = risk_free_rate || 0.05;
    let finalDividendYield = dividend_yield || 0;
    let marketContext = null;
    let volatilityRegime = null;
    
    // Fetch real market data if requested
    if (use_market_data && symbol) {
      console.error(`INFO: Fetching real market data for optimization of ${symbol}...`);
      
      try {
        // Get current price
        const priceData = await marketData.getCurrentPrice(symbol);
        finalUnderlyingPrice = priceData.price;
        
        console.error(`INFO: Current ${symbol} price: $${finalUnderlyingPrice.toFixed(2)}`);
        
        // Get historical volatility if not provided
        if (!finalVolatility) {
          console.error(`INFO: Calculating historical volatility for ${symbol}...`);
          const historicalData = await marketData.getHistoricalPrices(symbol, 'compact');
          const volData = MarketCalculations.calculateHistoricalVolatility(historicalData, 60); // 60-day for optimization
          finalVolatility = volData.annualizedVolatility;
          
          console.error(`INFO: 60-day historical volatility: ${(finalVolatility * 100).toFixed(1)}%`);
        }
        
        // Get risk-free rate if not provided
        if (!risk_free_rate) {
          const treasuryData = await marketData.getRiskFreeRate('10year');
          finalRiskFreeRate = treasuryData.rate;
          
          console.error(`INFO: Current 10-year Treasury rate: ${(finalRiskFreeRate * 100).toFixed(2)}%`);
        }
        
        // Get company overview for dividend yield
        if (!dividend_yield) {
          try {
            const overview = await marketData.getCompanyOverview(symbol);
            finalDividendYield = overview.dividendYield || 0;
            
            if (finalDividendYield > 0) {
              console.error(`INFO: ${symbol} dividend yield: ${(finalDividendYield * 100).toFixed(2)}%`);
            }
          } catch (error) {
            console.error(`WARNING: Could not fetch dividend yield for ${symbol}, using 0%`);
          }
        }
        
        // Detect volatility regime if requested
        if (market_regime_aware) {
          volatilityRegime = MarketCalculations.detectVolatilityRegime(finalVolatility);
          console.error(`INFO: Current volatility regime: ${volatilityRegime.description}`);
        }
        
        // Store market context
        marketContext = {
          symbol: symbol,
          currentPrice: finalUnderlyingPrice,
          marketVolatility: finalVolatility,
          riskFreeRate: finalRiskFreeRate,
          dividendYield: finalDividendYield,
          volatilityRegime: volatilityRegime,
          dataTimestamp: priceData.timestamp
        };
        
      } catch (error) {
        console.warn(`WARNING: Could not fetch market data for ${symbol}: ${error.message}`);
        console.error(`INFO: Using provided parameters as fallback`);
        finalUnderlyingPrice = underlying_price;
        finalVolatility = volatility;
        finalRiskFreeRate = risk_free_rate || 0.05;
      }
    }

    console.error(`Optimizing ${product_type} structure for ${(target_return * 100)}% target return`);
    
    let optimizationResult;
    
    // Adjust risk tolerance based on volatility regime if requested
    let adjustedRiskTolerance = risk_tolerance;
    if (market_regime_aware && volatilityRegime) {
      switch (volatilityRegime.regime) {
        case 'low':
          adjustedRiskTolerance = Math.min(1.0, risk_tolerance * 1.2); // More aggressive in low vol
          break;
        case 'high':
          adjustedRiskTolerance = Math.max(0.1, risk_tolerance * 0.8); // More conservative in high vol
          break;
        case 'extreme':
          adjustedRiskTolerance = Math.max(0.1, risk_tolerance * 0.6); // Very conservative in extreme vol
          break;
        default:
          adjustedRiskTolerance = risk_tolerance;
      }
      
      if (adjustedRiskTolerance !== risk_tolerance) {
        console.error(`INFO: Risk tolerance adjusted for ${volatilityRegime.regime} volatility regime: ${adjustedRiskTolerance.toFixed(2)}`);
      }
    }
    
    // Create enhanced args with market data
    const enhancedArgs = {
      ...args,
      underlying_price: finalUnderlyingPrice,
      volatility: finalVolatility,
      risk_free_rate: finalRiskFreeRate,
      risk_tolerance: adjustedRiskTolerance,
      dividend_yield: finalDividendYield
    };

    switch (product_type) {
      case 'autocallable':
        optimizationResult = await optimizeAutocallable(enhancedArgs);
        break;
      case 'barrier_option':
        optimizationResult = await optimizeBarrierOption(enhancedArgs);
        break;
      case 'call':
      case 'put':
        optimizationResult = await optimizeVanillaOption(enhancedArgs);
        break;
      default:
        optimizationResult = await optimizeGenericStructure(enhancedArgs);
    }
    
    // Generate comprehensive report with market context
    const report = generateOptimizationReport({
      product_type,
      input_parameters: enhancedArgs,
      optimization_result: optimizationResult,
      underlying_price: finalUnderlyingPrice,
      target_return,
      marketContext,
      use_market_data
    });
    
    return {
      content: [
        {
          type: "text",
          text: `# Structure Optimization Results\n\n${report}\n\n## Optimization Details\n\`\`\`json\n${JSON.stringify({
            optimal_parameters: optimizationResult.optimal_parameters,
            performance_metrics: optimizationResult.performance_metrics,
            risk_analysis: optimizationResult.risk_analysis,
            comparison_analysis: optimizationResult.comparison_analysis
          }, null, 2)}\n\`\`\``
        }
      ]
    };
    
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error optimizing structure: ${error.message}`
        }
      ]
    };
  }
}

async function optimizeAutocallable(params) {
  const { underlying_price, volatility, target_return, time_to_expiry, risk_tolerance, risk_free_rate } = params;
  
  // Parameter ranges for optimization
  const strikeRange = { min: underlying_price * 0.7, max: underlying_price * 1.0, steps: 10 };
  const barrierRange = { min: underlying_price * 0.5, max: underlying_price * 0.9, steps: 10 };
  const couponRange = { min: 0.05, max: 0.25, steps: 8 };
  
  let bestConfig = null;
  let bestScore = -Infinity;
  const allConfigurations = [];
  
  // Grid search optimization
  for (let s = 0; s <= strikeRange.steps; s++) {
    const strike = strikeRange.min + (s / strikeRange.steps) * (strikeRange.max - strikeRange.min);
    
    for (let b = 0; b <= barrierRange.steps; b++) {
      const barrier = barrierRange.min + (b / barrierRange.steps) * (barrierRange.max - barrierRange.min);
      
      for (let c = 0; c <= couponRange.steps; c++) {
        const coupon = couponRange.min + (c / couponRange.steps) * (couponRange.max - couponRange.min);
        
        // Run Monte Carlo for this configuration
        const performance = await evaluateAutocallable({
          underlying_price,
          strike_price: strike,
          barrier_level: barrier,
          coupon,
          volatility,
          risk_free_rate,
          time_to_expiry,
          num_simulations: 5000
        });
        
        // Calculate optimization score
        const returnDiff = Math.abs(performance.expected_return - target_return);
        const riskAdjustedReturn = performance.expected_return - risk_tolerance * performance.volatility;
        const score = riskAdjustedReturn - 2 * returnDiff; // Penalty for missing target
        
        const config = {
          strike_price: strike,
          barrier_level: barrier,
          coupon_rate: coupon,
          performance,
          score
        };
        
        allConfigurations.push(config);
        
        if (score > bestScore) {
          bestScore = score;
          bestConfig = config;
        }
      }
    }
  }
  
  // Generate comparison analysis
  const topConfigurations = allConfigurations
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  
  return {
    optimal_parameters: {
      strike_price: bestConfig.strike_price,
      barrier_level: bestConfig.barrier_level,
      coupon_rate: bestConfig.coupon_rate,
      optimization_score: bestConfig.score
    },
    performance_metrics: bestConfig.performance,
    risk_analysis: {
      meets_target_return: Math.abs(bestConfig.performance.expected_return - target_return) < 0.02,
      risk_adjusted_return: bestConfig.performance.expected_return - risk_tolerance * bestConfig.performance.volatility,
      barrier_safety_margin: (bestConfig.barrier_level / underlying_price - 0.5) * 100, // % above 50% barrier
    },
    comparison_analysis: {
      top_alternatives: topConfigurations.slice(1, 4),
      total_configurations_tested: allConfigurations.length,
      optimization_range: {
        best_score: topConfigurations[0].score,
        worst_score: Math.min(...allConfigurations.map(c => c.score))
      }
    }
  };
}

async function optimizeBarrierOption(params) {
  const { underlying_price, volatility, target_return, time_to_expiry, risk_tolerance, risk_free_rate } = params;
  
  // Parameter ranges
  const strikeRange = { min: underlying_price * 0.8, max: underlying_price * 1.2, steps: 12 };
  const barrierRange = { min: underlying_price * 0.4, max: underlying_price * 0.8, steps: 10 };
  
  let bestConfig = null;
  let bestScore = -Infinity;
  const allConfigurations = [];
  
  for (let s = 0; s <= strikeRange.steps; s++) {
    const strike = strikeRange.min + (s / strikeRange.steps) * (strikeRange.max - strikeRange.min);
    
    for (let b = 0; b <= barrierRange.steps; b++) {
      const barrier = barrierRange.min + (b / barrierRange.steps) * (barrierRange.max - barrierRange.min);
      
      const performance = await evaluateBarrierOption({
        underlying_price,
        strike_price: strike,
        barrier_level: barrier,
        volatility,
        risk_free_rate,
        time_to_expiry,
        num_simulations: 3000
      });
      
      const returnDiff = Math.abs(performance.expected_return - target_return);
      const riskAdjustedReturn = performance.expected_return - risk_tolerance * performance.volatility;
      const score = riskAdjustedReturn - 3 * returnDiff - 0.5 * performance.barrier_breach_probability; // Penalty for barrier risk
      
      const config = {
        strike_price: strike,
        barrier_level: barrier,
        performance,
        score
      };
      
      allConfigurations.push(config);
      
      if (score > bestScore) {
        bestScore = score;
        bestConfig = config;
      }
    }
  }
  
  const topConfigurations = allConfigurations
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  
  return {
    optimal_parameters: {
      strike_price: bestConfig.strike_price,
      barrier_level: bestConfig.barrier_level,
      optimization_score: bestConfig.score
    },
    performance_metrics: bestConfig.performance,
    risk_analysis: {
      meets_target_return: Math.abs(bestConfig.performance.expected_return - target_return) < 0.02,
      barrier_risk_acceptable: bestConfig.performance.barrier_breach_probability < 0.15,
      risk_adjusted_return: bestConfig.performance.expected_return - risk_tolerance * bestConfig.performance.volatility
    },
    comparison_analysis: {
      top_alternatives: topConfigurations.slice(1, 4),
      total_configurations_tested: allConfigurations.length
    }
  };
}

async function optimizeVanillaOption(params) {
  const { product_type, underlying_price, volatility, target_return, time_to_expiry, risk_tolerance, risk_free_rate } = params;
  
  // For vanilla options, mainly optimize strike price
  const strikeRange = { min: underlying_price * 0.7, max: underlying_price * 1.3, steps: 20 };
  
  let bestConfig = null;
  let bestScore = -Infinity;
  const allConfigurations = [];
  
  for (let s = 0; s <= strikeRange.steps; s++) {
    const strike = strikeRange.min + (s / strikeRange.steps) * (strikeRange.max - strikeRange.min);
    
    // Calculate option premium and expected payoffs
    const optionPremium = blackScholes(underlying_price, strike, time_to_expiry, risk_free_rate, volatility, product_type);
    
    // Monte Carlo for expected returns
    const payoffs = [];
    for (let i = 0; i < 10000; i++) {
      const path = simulateGBM(underlying_price, risk_free_rate, volatility, time_to_expiry, 1);
      const finalPrice = path[1];
      const payoff = calculatePayoff(product_type, finalPrice, strike, null);
      const totalReturn = (payoff - optionPremium) / optionPremium;
      payoffs.push(totalReturn);
    }
    
    const stats = calculateStats(payoffs);
    const expectedReturn = stats.mean;
    const returnVolatility = stats.stdDev;
    
    const returnDiff = Math.abs(expectedReturn - target_return);
    const riskAdjustedReturn = expectedReturn - risk_tolerance * returnVolatility;
    const score = riskAdjustedReturn - 2 * returnDiff;
    
    const config = {
      strike_price: strike,
      option_premium: optionPremium,
      expected_return: expectedReturn,
      return_volatility: returnVolatility,
      score
    };
    
    allConfigurations.push(config);
    
    if (score > bestScore) {
      bestScore = score;
      bestConfig = config;
    }
  }
  
  return {
    optimal_parameters: {
      strike_price: bestConfig.strike_price,
      option_premium: bestConfig.option_premium,
      optimization_score: bestConfig.score
    },
    performance_metrics: {
      expected_return: bestConfig.expected_return,
      volatility: bestConfig.return_volatility,
      sharpe_ratio: bestConfig.expected_return / bestConfig.return_volatility
    },
    risk_analysis: {
      meets_target_return: Math.abs(bestConfig.expected_return - target_return) < 0.02,
      moneyness: underlying_price / bestConfig.strike_price,
      risk_adjusted_return: bestConfig.expected_return - risk_tolerance * bestConfig.return_volatility
    },
    comparison_analysis: {
      top_alternatives: allConfigurations.sort((a, b) => b.score - a.score).slice(1, 4),
      total_configurations_tested: allConfigurations.length
    }
  };
}

async function optimizeGenericStructure(params) {
  // Generic optimization for other product types
  const { product_type, underlying_price, volatility, target_return, time_to_expiry, risk_tolerance, risk_free_rate } = params;
  
  const strikeRange = { min: underlying_price * 0.8, max: underlying_price * 1.2, steps: 15 };
  const barrierRange = { min: underlying_price * 0.6, max: underlying_price * 0.9, steps: 8 };
  
  let bestConfig = null;
  let bestScore = -Infinity;
  
  for (let s = 0; s <= strikeRange.steps; s++) {
    const strike = strikeRange.min + (s / strikeRange.steps) * (strikeRange.max - strikeRange.min);
    
    for (let b = 0; b <= barrierRange.steps; b++) {
      const barrier = barrierRange.min + (b / barrierRange.steps) * (barrierRange.max - barrierRange.min);
      
      // Simple Monte Carlo evaluation
      const payoffs = [];
      for (let i = 0; i < 5000; i++) {
        const path = simulateGBM(underlying_price, risk_free_rate, volatility, time_to_expiry, 100);
        const finalPrice = path[path.length - 1];
        const payoff = calculatePayoff(product_type, finalPrice, strike, barrier);
        payoffs.push(payoff);
      }
      
      const stats = calculateStats(payoffs);
      const expectedReturn = (stats.mean - 1); // Assuming unit investment
      const returnDiff = Math.abs(expectedReturn - target_return);
      const score = expectedReturn - risk_tolerance * stats.stdDev - 2 * returnDiff;
      
      if (score > bestScore) {
        bestScore = score;
        bestConfig = {
          strike_price: strike,
          barrier_level: barrier,
          expected_payoff: stats.mean,
          payoff_volatility: stats.stdDev,
          expected_return: expectedReturn,
          score
        };
      }
    }
  }
  
  return {
    optimal_parameters: {
      strike_price: bestConfig.strike_price,
      barrier_level: bestConfig.barrier_level,
      optimization_score: bestConfig.score
    },
    performance_metrics: {
      expected_return: bestConfig.expected_return,
      volatility: bestConfig.payoff_volatility,
      expected_payoff: bestConfig.expected_payoff
    },
    risk_analysis: {
      meets_target_return: Math.abs(bestConfig.expected_return - target_return) < 0.02
    },
    comparison_analysis: {
      optimization_method: 'Grid search with Monte Carlo evaluation'
    }
  };
}

async function evaluateAutocallable(params) {
  const { underlying_price, strike_price, barrier_level, coupon, volatility, risk_free_rate, time_to_expiry, num_simulations } = params;
  
  const payoffs = [];
  let earlyCalls = 0;
  let barrierBreaches = 0;
  
  for (let i = 0; i < num_simulations; i++) {
    const path = simulateGBM(underlying_price, risk_free_rate, volatility, time_to_expiry, 252);
    
    // Check for early call (simplified: only at quarterly dates)
    let called = false;
    const quarterlyDates = [63, 126, 189]; // Roughly quarterly
    
    for (const date of quarterlyDates) {
      if (path[date] >= barrier_level) {
        const timeToCall = date / 252 * time_to_expiry;
        const discountedPayoff = (1 + coupon * timeToCall) * Math.exp(-risk_free_rate * timeToCall);
        payoffs.push(discountedPayoff);
        called = true;
        earlyCalls++;
        break;
      }
    }
    
    if (!called) {
      const finalPrice = path[path.length - 1];
      const hasBreached = path.some(price => price < barrier_level);
      if (hasBreached) barrierBreaches++;
      
      let finalPayoff;
      if (finalPrice >= barrier_level) {
        finalPayoff = 1 + coupon;
      } else if (finalPrice >= strike_price) {
        finalPayoff = 1;
      } else {
        finalPayoff = finalPrice / strike_price;
      }
      
      const discountedPayoff = finalPayoff * Math.exp(-risk_free_rate * time_to_expiry);
      payoffs.push(discountedPayoff);
    }
  }
  
  const stats = calculateStats(payoffs);
  
  return {
    expected_payoff: stats.mean,
    expected_return: stats.mean - 1,
    volatility: stats.stdDev,
    early_call_probability: earlyCalls / num_simulations,
    barrier_breach_probability: barrierBreaches / (num_simulations - earlyCalls),
    percentiles: stats.percentiles
  };
}

async function evaluateBarrierOption(params) {
  const { underlying_price, strike_price, barrier_level, volatility, risk_free_rate, time_to_expiry, num_simulations } = params;
  
  const payoffs = [];
  let barrierBreaches = 0;
  
  for (let i = 0; i < num_simulations; i++) {
    const path = simulateGBM(underlying_price, risk_free_rate, volatility, time_to_expiry, 252);
    const finalPrice = path[path.length - 1];
    
    const breached = path.some(price => price <= barrier_level);
    if (breached) {
      barrierBreaches++;
      payoffs.push(0); // Knocked out
    } else {
      const payoff = Math.max(finalPrice - strike_price, 0);
      payoffs.push(payoff * Math.exp(-risk_free_rate * time_to_expiry));
    }
  }
  
  const stats = calculateStats(payoffs);
  
  return {
    expected_payoff: stats.mean,
    expected_return: stats.mean / underlying_price, // Rough approximation
    volatility: stats.stdDev,
    barrier_breach_probability: barrierBreaches / num_simulations,
    survival_probability: 1 - barrierBreaches / num_simulations,
    percentiles: stats.percentiles
  };
}

function generateOptimizationReport(data) {
  const { product_type, input_parameters, optimization_result, underlying_price, target_return, marketContext, use_market_data } = data;
  const { optimal_parameters, performance_metrics, risk_analysis, comparison_analysis } = optimization_result;
  
  let report = `## ${product_type.toUpperCase()} Structure Optimization\n\n`;
  
  // Executive summary
  report += `### Optimization Summary\n`;
  report += `- **Target Return**: ${(target_return * 100).toFixed(1)}%\n`;
  report += `- **Achieved Return**: ${(performance_metrics.expected_return * 100).toFixed(1)}%\n`;
  report += `- **Target Met**: ${risk_analysis.meets_target_return ? 'SUCCESS: Yes' : 'ERROR: No'}\n`;
  report += `- **Risk-Adjusted Return**: ${(risk_analysis.risk_adjusted_return * 100).toFixed(1)}%\n\n`;
  
  // Optimal parameters
  report += `### Optimal Structure Parameters\n`;
  report += `- **Strike Price**: $${optimal_parameters.strike_price.toFixed(2)}\n`;
  
  if (optimal_parameters.barrier_level) {
    report += `- **Barrier Level**: $${optimal_parameters.barrier_level.toFixed(2)}\n`;
    report += `- **Barrier as % of Spot**: ${(optimal_parameters.barrier_level / underlying_price * 100).toFixed(1)}%\n`;
  }
  
  if (optimal_parameters.coupon_rate) {
    report += `- **Coupon Rate**: ${(optimal_parameters.coupon_rate * 100).toFixed(1)}%\n`;
  }
  
  if (optimal_parameters.option_premium) {
    report += `- **Option Premium**: $${optimal_parameters.option_premium.toFixed(4)}\n`;
  }
  
  report += `- **Optimization Score**: ${optimal_parameters.optimization_score.toFixed(3)}\n\n`;
  
  // Market data context (if used)
  if (marketContext && use_market_data) {
    report += `### Market Data Context\n`;
    report += `- **Symbol**: ${marketContext.symbol}\n`;
    report += `- **Live Price**: $${marketContext.currentPrice.toFixed(2)}\n`;
    report += `- **Historical Volatility**: ${(marketContext.marketVolatility * 100).toFixed(1)}%\n`;
    report += `- **Current Risk-Free Rate**: ${(marketContext.riskFreeRate * 100).toFixed(2)}%\n`;
    
    if (marketContext.dividendYield > 0) {
      report += `- **Dividend Yield**: ${(marketContext.dividendYield * 100).toFixed(2)}%\n`;
    }
    
    if (marketContext.volatilityRegime) {
      report += `- **Volatility Regime**: ${marketContext.volatilityRegime.description}\n`;
    }
    
    report += `- **Data as of**: ${new Date(marketContext.dataTimestamp).toLocaleString()}\n\n`;
  }
  
  // Performance metrics
  report += `### Performance Analysis\n`;
  report += `- **Expected Return**: ${(performance_metrics.expected_return * 100).toFixed(2)}%\n`;
  report += `- **Return Volatility**: ${(performance_metrics.volatility * 100).toFixed(2)}%\n`;
  
  if (performance_metrics.sharpe_ratio) {
    report += `- **Sharpe Ratio**: ${performance_metrics.sharpe_ratio.toFixed(3)}\n`;
  }
  
  if (performance_metrics.early_call_probability) {
    report += `- **Early Call Probability**: ${(performance_metrics.early_call_probability * 100).toFixed(1)}%\n`;
  }
  
  if (performance_metrics.barrier_breach_probability !== undefined) {
    report += `- **Barrier Breach Risk**: ${(performance_metrics.barrier_breach_probability * 100).toFixed(1)}%\n`;
  }
  
  report += `\n`;
  
  // Risk analysis
  report += `### Risk Assessment\n`;
  
  if (risk_analysis.barrier_safety_margin) {
    report += `- **Barrier Safety Margin**: ${risk_analysis.barrier_safety_margin.toFixed(1)}% above 50% level\n`;
  }
  
  if (risk_analysis.moneyness) {
    const moneyness = risk_analysis.moneyness;
    const moneynessDesc = moneyness > 1.05 ? 'Deep ITM' : moneyness > 0.95 ? 'ATM' : 'OTM';
    report += `- **Moneyness**: ${moneyness.toFixed(3)} (${moneynessDesc})\n`;
  }
  
  if (risk_analysis.barrier_risk_acceptable !== undefined) {
    report += `- **Barrier Risk Level**: ${risk_analysis.barrier_risk_acceptable ? 'Acceptable' : 'High Risk'}\n`;
  }
  
  report += `\n`;
  
  // Alternative structures
  if (comparison_analysis.top_alternatives && comparison_analysis.top_alternatives.length > 0) {
    report += `### Alternative Structures\n`;
    report += `*Top alternatives considered during optimization:*\n\n`;
    
    comparison_analysis.top_alternatives.forEach((alt, index) => {
      report += `**Alternative ${index + 1}:**\n`;
      report += `- Strike: $${alt.strike_price.toFixed(2)}`;
      
      if (alt.barrier_level) {
        report += `, Barrier: $${alt.barrier_level.toFixed(2)}`;
      }
      
      if (alt.coupon_rate) {
        report += `, Coupon: ${(alt.coupon_rate * 100).toFixed(1)}%`;
      }
      
      report += `\n`;
      
      if (alt.performance) {
        report += `- Expected Return: ${(alt.performance.expected_return * 100).toFixed(1)}%\n`;
      } else if (alt.expected_return) {
        report += `- Expected Return: ${(alt.expected_return * 100).toFixed(1)}%\n`;
      }
      
      report += `- Score: ${alt.score.toFixed(3)}\n\n`;
    });
  }
  
  // Optimization details
  if (comparison_analysis.total_configurations_tested) {
    report += `### Optimization Process\n`;
    report += `- **Total Configurations Tested**: ${comparison_analysis.total_configurations_tested.toLocaleString()}\n`;
    
    if (comparison_analysis.optimization_range) {
      report += `- **Score Range**: ${comparison_analysis.optimization_range.worst_score.toFixed(3)} to ${comparison_analysis.optimization_range.best_score.toFixed(3)}\n`;
    }
    
    report += `- **Method**: Grid search with Monte Carlo evaluation\n`;
    report += `- **Risk Tolerance Used**: ${input_parameters.risk_tolerance}\n\n`;
  }
  
  // Recommendations
  report += `### Recommendations\n`;
  
  if (risk_analysis.meets_target_return) {
    report += `SUCCESS: **Target Achieved**: The optimized structure meets your target return of ${(target_return * 100).toFixed(1)}%\n`;
  } else {
    const gap = Math.abs(performance_metrics.expected_return - target_return);
    report += `WARNING: **Target Gap**: ${(gap * 100).toFixed(1)}% shortfall from target return\n`;
    report += `- Consider adjusting risk tolerance or exploring different product types\n`;
  }
  
  if (performance_metrics.volatility > 0.2) {
    report += `WARNING: **High Volatility**: Return volatility of ${(performance_metrics.volatility * 100).toFixed(1)}% indicates significant risk\n`;
  }
  
  if (performance_metrics.barrier_breach_probability > 0.2) {
    report += `WARNING: **Barrier Risk**: ${(performance_metrics.barrier_breach_probability * 100).toFixed(1)}% probability of barrier breach\n`;
    report += `- Consider lowering barrier or adding protection features\n`;
  }
  
  report += `- **Implementation**: Monitor market conditions and adjust parameters if needed\n`;
  report += `- **Review**: Re-optimize quarterly or when market conditions change significantly\n`;
  
  return report;
}