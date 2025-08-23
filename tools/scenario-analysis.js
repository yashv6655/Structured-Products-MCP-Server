import { calculatePayoff, simulateGBM, calculateStats } from './financial-math.js';
import marketData from '../services/market-data.js';
import MarketCalculations from '../utils/market-calculations.js';

export async function stressTestScenarios(args) {
  try {
    const {
      product_type,
      underlying_price,
      strike_price,
      volatility,
      scenarios,
      risk_free_rate,
      time_to_expiry = 1,
      barrier_level,
      num_simulations = 1000,
      symbol, // NEW: Stock symbol for real market data
      use_market_data = false, // NEW: Flag to use real market data
      include_historical_scenarios = true // NEW: Include historical market crises
    } = args;

    let finalUnderlyingPrice = underlying_price;
    let finalVolatility = volatility;
    let finalRiskFreeRate = risk_free_rate || 0.05;
    let marketContext = null;
    
    // Fetch real market data if requested
    if (use_market_data && symbol) {
      console.error(`INFO: Fetching real market data for stress testing ${symbol}...`);
      
      try {
        // Get current price
        const priceData = await marketData.getCurrentPrice(symbol);
        finalUnderlyingPrice = priceData.price;
        
        console.error(`INFO: Current ${symbol} price: $${finalUnderlyingPrice.toFixed(2)}`);
        
        // Get historical volatility if not provided
        if (!finalVolatility) {
          console.error(`INFO: Calculating historical volatility for ${symbol}...`);
          const historicalData = await marketData.getHistoricalPrices(symbol, 'compact');
          const volData = MarketCalculations.calculateHistoricalVolatility(historicalData, 90); // 90-day for stress testing
          finalVolatility = volData.annualizedVolatility;
          
          console.error(`INFO: 90-day historical volatility: ${(finalVolatility * 100).toFixed(1)}%`);
        }
        
        // Get risk-free rate if not provided
        if (!risk_free_rate) {
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
        finalRiskFreeRate = risk_free_rate || 0.05;
      }
    }
    
    // Determine scenarios to use
    let scenariosToUse = scenarios || [];
    
    if (include_historical_scenarios) {
      const historicalScenarios = getHistoricalMarketCrises();
      scenariosToUse = [...historicalScenarios, ...scenariosToUse];
      console.error(`INFO: Including ${historicalScenarios.length} historical market crisis scenarios`);
    }
    
    if (scenariosToUse.length === 0) {
      scenariosToUse = getDefaultScenarios();
    }

    console.error(`Running stress test scenarios for ${product_type}`);
    
    const results = [];
    
    // Base case scenario using final market parameters
    const baseCase = await runScenario('Base Case', {
      product_type,
      underlying_price: finalUnderlyingPrice,
      strike_price,
      volatility: finalVolatility,
      risk_free_rate: finalRiskFreeRate,
      time_to_expiry,
      barrier_level,
      price_shock: 0,
      vol_shock: 0,
      rate_shock: 0
    }, num_simulations);
    
    results.push(baseCase);
    
    // Run each stress scenario with final market parameters as base
    for (const scenario of scenariosToUse) {
      const stressResult = await runScenario(scenario.name, {
        product_type,
        underlying_price: finalUnderlyingPrice,
        strike_price,
        volatility: finalVolatility,
        risk_free_rate: finalRiskFreeRate,
        time_to_expiry,
        barrier_level,
        ...scenario
      }, num_simulations);
      
      results.push(stressResult);
    }
    
    // Calculate relative impacts
    const impactAnalysis = calculateImpactAnalysis(results, baseCase.fair_value);
    
    // Generate enhanced comprehensive report with market context
    const report = generateStressTestReport({
      product_type,
      base_parameters: {
        underlying_price: finalUnderlyingPrice,
        strike_price,
        volatility: finalVolatility,
        risk_free_rate: finalRiskFreeRate,
        time_to_expiry,
        barrier_level
      },
      results,
      impactAnalysis,
      marketContext,
      use_market_data
    });
    
    return {
      content: [
        {
          type: "text",
          text: `# Stress Test Analysis\n\n${report}\n\n## Detailed Results\n\`\`\`json\n${JSON.stringify({
            base_case: baseCase,
            stress_scenarios: results.slice(1),
            impact_summary: impactAnalysis,
            worst_case: results.reduce((worst, current) => 
              current.fair_value < worst.fair_value ? current : worst
            ),
            best_case: results.reduce((best, current) => 
              current.fair_value > best.fair_value ? current : best
            )
          }, null, 2)}\n\`\`\``
        }
      ]
    };
    
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error running stress test scenarios: ${error.message}`
        }
      ]
    };
  }
}

async function runScenario(scenarioName, params, numSims) {
  const {
    product_type,
    underlying_price,
    strike_price,
    volatility,
    risk_free_rate,
    time_to_expiry,
    barrier_level,
    price_shock = 0,
    vol_shock = 0,
    rate_shock = 0
  } = params;
  
  // Apply shocks
  const shocked_price = underlying_price * (1 + price_shock);
  const shocked_vol = Math.max(0.01, volatility + vol_shock);
  const shocked_rate = risk_free_rate + rate_shock;
  
  const payoffs = [];
  const finalPrices = [];
  let barrierBreaches = 0;
  
  // Run Monte Carlo simulation for this scenario
  for (let i = 0; i < numSims; i++) {
    const path = simulateGBM(shocked_price, shocked_rate, shocked_vol, time_to_expiry, 252);
    const finalPrice = path[path.length - 1];
    finalPrices.push(finalPrice);
    
    // Check barrier breaches
    if (barrier_level && product_type === 'barrier_option') {
      const breached = path.some(price => price <= barrier_level);
      if (breached) barrierBreaches++;
    }
    
    // Calculate payoff
    let payoff = calculatePayoff(product_type, finalPrice, strike_price, barrier_level, {
      knockedOut: barrier_level && path.some(price => price <= barrier_level),
      coupon: 0.1
    });
    
    // Discount to present value
    const discountedPayoff = payoff * Math.exp(-shocked_rate * time_to_expiry);
    payoffs.push(discountedPayoff);
  }
  
  const payoffStats = calculateStats(payoffs);
  const priceStats = calculateStats(finalPrices);
  
  // Calculate additional risk metrics
  const sortedPayoffs = [...payoffs].sort((a, b) => a - b);
  const var95Index = Math.floor(0.05 * sortedPayoffs.length);
  const risk_metrics = {
    probability_of_loss: payoffs.filter(p => p < 0).length / payoffs.length,
    var_95: sortedPayoffs[var95Index],
    expected_shortfall: sortedPayoffs.slice(0, var95Index)
      .reduce((sum, x) => sum + x, 0) / var95Index
  };
  
  return {
    scenario_name: scenarioName,
    parameters: {
      underlying_price: shocked_price,
      strike_price,
      volatility: shocked_vol,
      risk_free_rate: shocked_rate,
      time_to_expiry,
      barrier_level,
      shocks: { price_shock, vol_shock, rate_shock }
    },
    fair_value: payoffStats.mean,
    payoff_volatility: payoffStats.stdDev,
    final_price_stats: {
      mean: priceStats.mean,
      std: priceStats.stdDev,
      percentiles: priceStats.percentiles
    },
    risk_metrics,
    barrier_breach_rate: barrier_level ? barrierBreaches / numSims : 0,
    payoff_distribution: {
      min: payoffStats.min,
      max: payoffStats.max,
      percentiles: payoffStats.percentiles
    }
  };
}

function getHistoricalMarketCrises() {
  return [
    {
      name: "2008 Financial Crisis",
      price_shock: -0.57, // S&P 500 peak-to-trough decline
      vol_shock: 0.40, // VIX spiked from ~15 to ~80
      rate_shock: -0.045, // Fed funds went from 5.25% to near 0%
      description: "Global financial meltdown, credit crisis, bank failures"
    },
    {
      name: "2020 COVID Pandemic",
      price_shock: -0.34, // March 2020 crash
      vol_shock: 0.50, // VIX hit 82.69, one of highest ever
      rate_shock: -0.015, // Fed cut rates to near zero
      description: "Global pandemic, economic lockdowns, supply chain disruption"
    },
    {
      name: "2000 Dot-com Bubble Burst",
      price_shock: -0.49, // NASDAQ declined ~78% from peak
      vol_shock: 0.25, // Tech volatility surge
      rate_shock: -0.035, // Fed cut from 6.5% to 1%
      description: "Technology bubble burst, internet company failures"
    },
    {
      name: "1987 Black Monday",
      price_shock: -0.22, // Single day 22% drop
      vol_shock: 0.60, // Extreme volatility spike
      rate_shock: -0.02, // Fed provided liquidity
      description: "Largest single-day percentage decline in stock market history"
    },
    {
      name: "2011 European Debt Crisis",
      price_shock: -0.19, // European markets decline
      vol_shock: 0.30, // Volatility surge during crisis
      rate_shock: -0.01, // ECB and Fed coordinated response
      description: "Sovereign debt crisis in Greece, Ireland, Portugal, Spain"
    },
    {
      name: "2018 Trade War Volatility",
      price_shock: -0.20, // Q4 2018 market decline
      vol_shock: 0.25, // Trade uncertainty volatility
      rate_shock: 0.00, // Fed paused rate hikes
      description: "US-China trade tensions, tariff wars, growth concerns"
    }
  ];
}

function getDefaultScenarios() {
  return [
    {
      name: "Market Crash (-30%)",
      price_shock: -0.30,
      vol_shock: 0.10,
      rate_shock: -0.02
    },
    {
      name: "Severe Market Crash (-50%)",
      price_shock: -0.50,
      vol_shock: 0.15,
      rate_shock: -0.03
    },
    {
      name: "Bull Market (+25%)",
      price_shock: 0.25,
      vol_shock: -0.05,
      rate_shock: 0.01
    },
    {
      name: "Volatility Spike",
      price_shock: -0.05,
      vol_shock: 0.20,
      rate_shock: 0
    },
    {
      name: "Interest Rate Shock (+3%)",
      price_shock: -0.10,
      vol_shock: 0.05,
      rate_shock: 0.03
    },
    {
      name: "Deflationary Environment",
      price_shock: -0.15,
      vol_shock: 0.10,
      rate_shock: -0.04
    },
    {
      name: "High Inflation Scenario",
      price_shock: 0.10,
      vol_shock: 0.08,
      rate_shock: 0.04
    },
    {
      name: "Sideways Market",
      price_shock: 0.02,
      vol_shock: -0.10,
      rate_shock: 0.005
    }
  ];
}

function calculateImpactAnalysis(results, baseValue) {
  const impacts = results.map(result => ({
    scenario: result.scenario_name,
    absolute_change: result.fair_value - baseValue,
    percentage_change: ((result.fair_value - baseValue) / baseValue) * 100,
    fair_value: result.fair_value
  }));
  
  // Sort by impact severity
  const sortedImpacts = impacts.slice(1).sort((a, b) => a.absolute_change - b.absolute_change);
  
  return {
    worst_scenario: sortedImpacts[0],
    best_scenario: sortedImpacts[sortedImpacts.length - 1],
    average_impact: sortedImpacts.reduce((sum, impact) => sum + impact.percentage_change, 0) / sortedImpacts.length,
    impact_range: sortedImpacts[sortedImpacts.length - 1].percentage_change - sortedImpacts[0].percentage_change,
    all_impacts: impacts
  };
}

function generateStressTestReport(data) {
  const { product_type, base_parameters, results, impactAnalysis, marketContext, use_market_data } = data;
  
  let report = `## ${product_type.toUpperCase()} Stress Test Results\n\n`;
  
  // Executive summary
  report += `### Executive Summary\n`;
  report += `- **Base Case Fair Value**: $${results[0].fair_value.toFixed(4)}\n`;
  report += `- **Worst Case Scenario**: ${impactAnalysis.worst_scenario.scenario} (${impactAnalysis.worst_scenario.percentage_change.toFixed(1)}% impact)\n`;
  report += `- **Best Case Scenario**: ${impactAnalysis.best_scenario.scenario} (+${impactAnalysis.best_scenario.percentage_change.toFixed(1)}% impact)\n`;
  report += `- **Impact Range**: ${impactAnalysis.impact_range.toFixed(1)}% between worst and best case\n\n`;
  
  // Market data context (if used)
  if (marketContext && use_market_data) {
    report += `### Market Data Context\n`;
    report += `- **Symbol**: ${marketContext.symbol}\n`;
    report += `- **Real-time Price**: $${marketContext.currentPrice.toFixed(2)}\n`;
    report += `- **Historical Volatility (90-day)**: ${(marketContext.marketVolatility * 100).toFixed(1)}%\n`;
    report += `- **Current 10-Year Treasury**: ${(marketContext.riskFreeRate * 100).toFixed(2)}%\n`;
    report += `- **Data Timestamp**: ${new Date(marketContext.dataTimestamp).toLocaleString()}\n\n`;
  }
  
  // Base parameters
  report += `### Base Case Parameters\n`;
  report += `- **Underlying Price**: $${base_parameters.underlying_price}${marketContext ? ` (Live: ${marketContext.symbol})` : ''}\n`;
  report += `- **Strike Price**: $${base_parameters.strike_price}\n`;
  report += `- **Volatility**: ${(base_parameters.volatility * 100).toFixed(1)}%${marketContext ? ' (Historical)' : ''}\n`;
  report += `- **Risk-Free Rate**: ${(base_parameters.risk_free_rate * 100).toFixed(2)}%${marketContext ? ' (Current Treasury)' : ''}\n`;
  report += `- **Time to Expiry**: ${base_parameters.time_to_expiry} years\n`;
  if (base_parameters.barrier_level) {
    report += `- **Barrier Level**: $${base_parameters.barrier_level}\n`;
  }
  report += `\n`;
  
  // Scenario results table
  report += `### Scenario Results\n\n`;
  report += `| Scenario | Fair Value | Change | Change % | P(Loss) | VaR 95% |\n`;
  report += `|----------|------------|---------|-----------|---------|----------|\n`;
  
  const baseValue = results[0].fair_value;
  for (const result of results) {
    const change = result.fair_value - baseValue;
    const changePercent = result.scenario_name === 'Base Case' ? 0 : (change / baseValue) * 100;
    
    report += `| ${result.scenario_name} | $${result.fair_value.toFixed(4)} | `;
    report += `${change >= 0 ? '+' : ''}$${change.toFixed(4)} | `;
    report += `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}% | `;
    report += `${(result.risk_metrics.probability_of_loss * 100).toFixed(1)}% | `;
    report += `$${Math.abs(result.risk_metrics.var_95).toFixed(4)} |\n`;
  }
  report += `\n`;
  
  // Risk analysis
  report += `### Risk Analysis by Scenario\n\n`;
  
  // Most vulnerable scenarios
  const vulnerableScenarios = results.slice(1)
    .filter(r => r.risk_metrics.probability_of_loss > 0.1)
    .sort((a, b) => b.risk_metrics.probability_of_loss - a.risk_metrics.probability_of_loss);
  
  if (vulnerableScenarios.length > 0) {
    report += `#### High-Risk Scenarios (P(Loss) > 10%)\n`;
    for (const scenario of vulnerableScenarios) {
      report += `- **${scenario.scenario_name}**: ${(scenario.risk_metrics.probability_of_loss * 100).toFixed(1)}% probability of loss\n`;
      report += `  - Fair Value: $${scenario.fair_value.toFixed(4)}\n`;
      report += `  - Expected Shortfall: $${Math.abs(scenario.risk_metrics.expected_shortfall).toFixed(4)}\n`;
      if (scenario.barrier_breach_rate > 0) {
        report += `  - Barrier Breach Rate: ${(scenario.barrier_breach_rate * 100).toFixed(1)}%\n`;
      }
      report += `\n`;
    }
  } else {
    report += `#### Risk Assessment\nNo scenarios show significant probability of loss (>10%), indicating robust structure.\n\n`;
  }
  
  // Sensitivity insights
  report += `### Key Sensitivities\n`;
  
  const marketCrashScenarios = results.filter(r => r.scenario_name.includes('Crash'));
  if (marketCrashScenarios.length > 0) {
    const avgCrashImpact = marketCrashScenarios.reduce((sum, r) => sum + (r.fair_value - baseValue), 0) / marketCrashScenarios.length;
    report += `- **Market Crash Sensitivity**: Average impact of ${(avgCrashImpact / baseValue * 100).toFixed(1)}% across crash scenarios\n`;
  }
  
  const volScenarios = results.filter(r => r.scenario_name.includes('Volatility') || r.scenario_name.includes('Spike'));
  if (volScenarios.length > 0) {
    const avgVolImpact = volScenarios.reduce((sum, r) => sum + (r.fair_value - baseValue), 0) / volScenarios.length;
    report += `- **Volatility Sensitivity**: Average impact of ${(avgVolImpact / baseValue * 100).toFixed(1)}% from volatility changes\n`;
  }
  
  const rateScenarios = results.filter(r => r.scenario_name.includes('Rate') || r.scenario_name.includes('Inflation'));
  if (rateScenarios.length > 0) {
    const avgRateImpact = rateScenarios.reduce((sum, r) => sum + (r.fair_value - baseValue), 0) / rateScenarios.length;
    report += `- **Interest Rate Sensitivity**: Average impact of ${(avgRateImpact / baseValue * 100).toFixed(1)}% from rate changes\n`;
  }
  
  report += `\n`;
  
  // Recommendations
  report += `### Risk Management Recommendations\n`;
  
  if (impactAnalysis.worst_scenario.percentage_change < -20) {
    report += `- **High Risk Alert**: Worst case scenario shows ${Math.abs(impactAnalysis.worst_scenario.percentage_change).toFixed(1)}% potential loss\n`;
    report += `- Consider hedging strategies or position sizing limits\n`;
  }
  
  if (vulnerableScenarios.length > 2) {
    report += `- **Multiple Risk Factors**: Product vulnerable to ${vulnerableScenarios.length} different stress scenarios\n`;
    report += `- Diversification across risk factors recommended\n`;
  }
  
  const barrierRiskScenarios = results.filter(r => r.barrier_breach_rate > 0.2);
  if (barrierRiskScenarios.length > 0) {
    report += `- **Barrier Risk**: High barrier breach probability in ${barrierRiskScenarios.length} scenarios\n`;
    report += `- Consider barrier level adjustment or enhanced protection features\n`;
  }
  
  report += `- **Stress Testing Frequency**: Recommend quarterly stress testing with updated market parameters\n`;
  
  return report;
}