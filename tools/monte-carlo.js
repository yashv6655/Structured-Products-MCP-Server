import { simulateGBM, calculatePayoff, calculateStats, calculateGreeks } from './financial-math.js';
import marketData from '../services/market-data.js';
import MarketCalculations from '../utils/market-calculations.js';

export async function runMonteCarloSimulation(args) {
  try {
    const {
      product_type,
      underlying_price,
      strike_price,
      volatility,
      risk_free_rate,
      time_to_expiry,
      num_simulations = 10000,
      barrier_level,
      dividend_yield = 0,
      num_steps = 252, // Daily steps for path-dependent options
      symbol, // NEW: Stock symbol for real market data
      use_market_data = false // NEW: Flag to use real market data
    } = args;
    
    let finalUnderlyingPrice = underlying_price;
    let finalVolatility = volatility;
    let finalRiskFreeRate = risk_free_rate;
    let marketContext = null;
    
    // Fetch real market data if requested
    if (use_market_data && symbol) {
      console.error(`INFO: Fetching real market data for Monte Carlo simulation of ${symbol}...`);
      
      try {
        // Get current price
        const priceData = await marketData.getCurrentPrice(symbol);
        finalUnderlyingPrice = priceData.price;
        
        console.error(`INFO: Current ${symbol} price: $${finalUnderlyingPrice.toFixed(2)}`);
        
        // Get historical volatility if not provided
        if (!finalVolatility) {
          console.error(`INFO: Calculating historical volatility for ${symbol}...`);
          const historicalData = await marketData.getHistoricalPrices(symbol, 'compact');
          const volData = MarketCalculations.calculateHistoricalVolatility(historicalData, 60); // 60-day for MC
          finalVolatility = volData.annualizedVolatility;
          
          console.error(`INFO: 60-day historical volatility: ${(finalVolatility * 100).toFixed(1)}%`);
        }
        
        // Get risk-free rate if not provided
        if (!finalRiskFreeRate) {
          const treasuryData = await marketData.getRiskFreeRate('10year');
          finalRiskFreeRate = treasuryData.rate;
          
          console.error(`INFO: Current 10-year Treasury rate: ${(finalRiskFreeRate * 100).toFixed(2)}%`);
        }
        
        // Store market context
        marketContext = {
          symbol: symbol,
          currentPrice: finalUnderlyingPrice,
          marketVolatility: finalVolatility,
          riskFreeRate: finalRiskFreeRate,
          dataTimestamp: priceData.timestamp
        };
        
      } catch (error) {
        console.warn(`WARNING: Could not fetch market data for ${symbol}: ${error.message}`);
        console.error(`INFO: Using provided parameters as fallback`);
        finalUnderlyingPrice = underlying_price;
        finalVolatility = volatility;
        finalRiskFreeRate = risk_free_rate;
      }
    }

    console.error(`Starting Monte Carlo simulation: ${num_simulations} paths for ${product_type}`);
    
    const results = [];
    const finalPrices = [];
    const paths = [];
    let barrierBreaches = 0;
    
    // Run simulations with real market parameters
    for (let i = 0; i < num_simulations; i++) {
      // Generate price path using final parameters (potentially from market data)
      const path = simulateGBM(
        finalUnderlyingPrice, 
        finalRiskFreeRate - dividend_yield, 
        finalVolatility, 
        time_to_expiry, 
        num_steps
      );
      
      const finalPrice = path[path.length - 1];
      finalPrices.push(finalPrice);
      
      // Check for barrier breaches (for barrier options)
      let knockedOut = false;
      if (barrier_level && product_type === 'barrier_option') {
        knockedOut = path.some(price => price <= barrier_level);
        if (knockedOut) barrierBreaches++;
      }
      
      // Calculate payoff based on product type
      let payoff = 0;
      
      switch (product_type) {
        case 'autocallable':
          payoff = calculateAutocallablePayoff(path, strike_price, barrier_level, {
            coupon: 0.1,
            observation_dates: [num_steps] // Simplified: only check at expiry
          });
          break;
          
        case 'barrier_option':
          payoff = calculatePayoff('barrier_option', finalPrice, strike_price, barrier_level, {
            knockedOut
          });
          break;
          
        case 'asian_option':
          const avgPrice = path.reduce((sum, price) => sum + price, 0) / path.length;
          payoff = Math.max(avgPrice - strike_price, 0);
          break;
          
        case 'lookback_option':
          const maxPrice = Math.max(...path);
          payoff = maxPrice - strike_price;
          break;
          
        default:
          payoff = calculatePayoff(product_type, finalPrice, strike_price, barrier_level);
      }
      
      // Discount to present value using final risk-free rate
      const discountedPayoff = payoff * Math.exp(-finalRiskFreeRate * time_to_expiry);
      results.push(discountedPayoff);
      
      // Store some sample paths for visualization
      if (i < 100) {
        paths.push(path);
      }
    }
    
    // Calculate statistics
    const stats = calculateStats(results);
    const finalPriceStats = calculateStats(finalPrices);
    
    // Calculate Greeks using finite difference method with final parameters
    const greeks = await calculateMonteCarloGreeks({
      product_type,
      underlying_price: finalUnderlyingPrice,
      strike_price,
      volatility: finalVolatility,
      risk_free_rate: finalRiskFreeRate,
      time_to_expiry,
      barrier_level,
      num_simulations: Math.min(5000, num_simulations) // Use fewer sims for Greeks
    });
    
    // Risk metrics
    const riskMetrics = calculateRiskMetrics(results, underlying_price);
    
    // Generate enhanced summary report with market context
    const report = generateSimulationReport({
      product_type,
      stats,
      finalPriceStats,
      greeks,
      riskMetrics,
      barrierBreaches,
      num_simulations,
      parameters: {
        ...args,
        final_underlying_price: finalUnderlyingPrice,
        final_volatility: finalVolatility,
        final_risk_free_rate: finalRiskFreeRate
      },
      marketContext
    });
    
    return {
      content: [
        {
          type: "text",
          text: `# Monte Carlo Simulation Results\n\n${report}\n\n## Sample Price Paths\n\`\`\`\nFirst 5 simulated paths (showing every 10th step):\n${formatSamplePaths(paths.slice(0, 5), num_steps)}\n\`\`\`\n\n## Raw Statistics\n\`\`\`json\n${JSON.stringify({
            simulation_stats: {
              option_value: stats.mean,
              standard_error: stats.stdDev / Math.sqrt(num_simulations),
              confidence_interval_95: [
                stats.mean - 1.96 * stats.stdDev / Math.sqrt(num_simulations),
                stats.mean + 1.96 * stats.stdDev / Math.sqrt(num_simulations)
              ],
              percentiles: stats.percentiles
            },
            underlying_price_stats: finalPriceStats,
            greeks,
            risk_metrics: riskMetrics
          }, null, 2)}\n\`\`\``
        }
      ]
    };
    
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error running Monte Carlo simulation: ${error.message}`
        }
      ]
    };
  }
}

function calculateAutocallablePayoff(path, strike, barrier, options = {}) {
  const { coupon = 0.1, observation_dates = [] } = options;
  const finalPrice = path[path.length - 1];
  
  // Check early call conditions at observation dates
  for (const date of observation_dates) {
    if (path[date] >= barrier) {
      return 1 + coupon * (date / path.length); // Pro-rated coupon
    }
  }
  
  // At expiry
  if (finalPrice >= barrier) {
    return 1 + coupon; // Principal + full coupon
  } else if (finalPrice >= strike) {
    return 1; // Just principal
  } else {
    return finalPrice / strike; // Participation in downside
  }
}

async function calculateMonteCarloGreeks(params) {
  const baseValue = await runSingleMonteCarlo(params);
  const bump = 0.01; // 1% bump for numerical derivatives
  
  // Delta: sensitivity to underlying price
  const upPrice = await runSingleMonteCarlo({
    ...params,
    underlying_price: params.underlying_price * (1 + bump)
  });
  const downPrice = await runSingleMonteCarlo({
    ...params,
    underlying_price: params.underlying_price * (1 - bump)
  });
  const delta = (upPrice - downPrice) / (2 * params.underlying_price * bump);
  
  // Vega: sensitivity to volatility
  const upVol = await runSingleMonteCarlo({
    ...params,
    volatility: params.volatility + 0.01
  });
  const vega = upVol - baseValue;
  
  // Theta: time decay (negative of time sensitivity)
  const shorterTime = await runSingleMonteCarlo({
    ...params,
    time_to_expiry: Math.max(0.001, params.time_to_expiry - 1/365)
  });
  const theta = -(shorterTime - baseValue);
  
  // Rho: interest rate sensitivity
  const upRate = await runSingleMonteCarlo({
    ...params,
    risk_free_rate: params.risk_free_rate + 0.01
  });
  const rho = upRate - baseValue;
  
  return {
    delta: delta,
    vega: vega * 100, // Per 1% vol change
    theta: theta * 365, // Per day
    rho: rho * 100 // Per 1% rate change
  };
}

async function runSingleMonteCarlo(params) {
  const numSims = params.num_simulations || 5000;
  const results = [];
  
  for (let i = 0; i < numSims; i++) {
    const path = simulateGBM(
      params.underlying_price,
      params.risk_free_rate,
      params.volatility,
      params.time_to_expiry,
      252
    );
    
    let payoff = calculatePayoff(
      params.product_type,
      path[path.length - 1],
      params.strike_price,
      params.barrier_level
    );
    
    const discountedPayoff = payoff * Math.exp(-params.risk_free_rate * params.time_to_expiry);
    results.push(discountedPayoff);
  }
  
  return results.reduce((sum, x) => sum + x, 0) / results.length;
}

function calculateRiskMetrics(payoffs, underlyingPrice) {
  const sorted = [...payoffs].sort((a, b) => a - b);
  const n = sorted.length;
  
  // Value at Risk (95% confidence)
  const var95 = sorted[Math.floor(0.05 * n)];
  
  // Expected Shortfall (Conditional VaR)
  const tailLosses = sorted.slice(0, Math.floor(0.05 * n));
  const expectedShortfall = tailLosses.reduce((sum, x) => sum + x, 0) / tailLosses.length;
  
  // Maximum drawdown
  const maxPayoff = Math.max(...payoffs);
  const minPayoff = Math.min(...payoffs);
  const maxDrawdown = maxPayoff - minPayoff;
  
  // Probability of loss
  const probabilityOfLoss = payoffs.filter(p => p < 0).length / payoffs.length;
  
  return {
    value_at_risk_95: var95,
    expected_shortfall: expectedShortfall,
    max_drawdown: maxDrawdown,
    probability_of_loss: probabilityOfLoss,
    worst_case: minPayoff,
    best_case: maxPayoff
  };
}

function generateSimulationReport(data) {
  const {
    product_type,
    stats,
    finalPriceStats,
    greeks,
    riskMetrics,
    barrierBreaches,
    num_simulations,
    parameters,
    marketContext
  } = data;
  
  let report = `## ${product_type.toUpperCase()} Monte Carlo Analysis\n\n`;
  
  // Basic results
  report += `### Valuation Results\n`;
  report += `- **Fair Value**: $${stats.mean.toFixed(4)}\n`;
  report += `- **Standard Error**: $${(stats.stdDev / Math.sqrt(num_simulations)).toFixed(4)}\n`;
  report += `- **95% Confidence Interval**: [$${(stats.mean - 1.96 * stats.stdDev / Math.sqrt(num_simulations)).toFixed(4)}, $${(stats.mean + 1.96 * stats.stdDev / Math.sqrt(num_simulations)).toFixed(4)}]\n`;
  report += `- **Payoff Volatility**: $${stats.stdDev.toFixed(4)}\n\n`;
  
  // Final price distribution
  report += `### Underlying Price Distribution at Expiry\n`;
  report += `- **Expected Final Price**: $${finalPriceStats.mean.toFixed(2)}\n`;
  report += `- **Price Volatility**: $${finalPriceStats.stdDev.toFixed(2)}\n`;
  report += `- **95% Price Range**: [$${finalPriceStats.percentiles.p5.toFixed(2)}, $${finalPriceStats.percentiles.p95.toFixed(2)}]\n\n`;
  
  // Risk metrics
  report += `### Risk Analysis\n`;
  report += `- **Value at Risk (95%)**: $${Math.abs(riskMetrics.value_at_risk_95).toFixed(4)}\n`;
  report += `- **Expected Shortfall**: $${Math.abs(riskMetrics.expected_shortfall).toFixed(4)}\n`;
  report += `- **Probability of Loss**: ${(riskMetrics.probability_of_loss * 100).toFixed(1)}%\n`;
  report += `- **Worst Case Scenario**: $${riskMetrics.worst_case.toFixed(4)}\n`;
  report += `- **Best Case Scenario**: $${riskMetrics.best_case.toFixed(4)}\n\n`;
  
  // Greeks
  report += `### Greeks (Risk Sensitivities)\n`;
  report += `- **Delta**: ${greeks.delta.toFixed(4)} (price sensitivity)\n`;
  report += `- **Vega**: ${greeks.vega.toFixed(4)} (volatility sensitivity per 1%)\n`;
  report += `- **Theta**: $${greeks.theta.toFixed(4)} (time decay per day)\n`;
  report += `- **Rho**: ${greeks.rho.toFixed(4)} (rate sensitivity per 1%)\n\n`;
  
  // Product-specific metrics
  if (barrierBreaches > 0) {
    report += `### Barrier Analysis\n`;
    report += `- **Barrier Breaches**: ${barrierBreaches} out of ${num_simulations} (${(barrierBreaches/num_simulations*100).toFixed(1)}%)\n`;
    report += `- **Survival Probability**: ${((num_simulations - barrierBreaches)/num_simulations*100).toFixed(1)}%\n\n`;
  }
  
  // Market data context (if available)
  if (marketContext) {
    report += `### Market Data Context\n`;
    report += `- **Symbol**: ${marketContext.symbol}\n`;
    report += `- **Real-time Price**: $${marketContext.currentPrice.toFixed(2)}\n`;
    report += `- **Historical Volatility**: ${(marketContext.marketVolatility * 100).toFixed(1)}%\n`;
    report += `- **Current Risk-Free Rate**: ${(marketContext.riskFreeRate * 100).toFixed(2)}%\n`;
    report += `- **Data as of**: ${new Date(marketContext.dataTimestamp).toLocaleString()}\n\n`;
  }
  
  // Simulation parameters
  report += `### Simulation Parameters\n`;
  report += `- **Number of Simulations**: ${num_simulations.toLocaleString()}\n`;
  report += `- **Underlying Price**: $${parameters.final_underlying_price || parameters.underlying_price}\n`;
  report += `- **Strike Price**: $${parameters.strike_price}\n`;
  report += `- **Volatility**: ${((parameters.final_volatility || parameters.volatility) * 100).toFixed(1)}%\n`;
  report += `- **Risk-Free Rate**: ${((parameters.final_risk_free_rate || parameters.risk_free_rate) * 100).toFixed(2)}%\n`;
  report += `- **Time to Expiry**: ${parameters.time_to_expiry} years\n`;
  
  if (parameters.barrier_level) {
    report += `- **Barrier Level**: $${parameters.barrier_level}\n`;
  }
  
  return report;
}

function formatSamplePaths(paths, numSteps) {
  let output = '';
  const stepSize = Math.max(1, Math.floor(numSteps / 10)); // Show ~10 points per path
  
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    output += `Path ${i + 1}: `;
    for (let j = 0; j < path.length; j += stepSize) {
      output += `${path[j].toFixed(2)} `;
    }
    output += '\n';
  }
  
  return output;
}