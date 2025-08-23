import marketDataService from '../services/market-data.js';
import {
  calculateReturns,
  calculateCovarianceMatrix,
  optimizeRiskParity as optimizeRiskParityCore,
  optimizeConstrainedRiskParity as optimizeConstrainedRiskParityCore,
  optimizeHierarchicalRiskParity as optimizeHierarchicalRiskParityCore,
  compareRiskParityMethods as compareRiskParityMethodsCore,
  calculateRiskContributions,
  calculatePortfolioReturn,
  calculatePortfolioVolatility,
  calculateSharpeRatio,
  calculateAdvancedRiskMetrics
} from '../utils/portfolio-math.js';
import { mean, standardDeviation } from 'simple-statistics';

/**
 * Risk Parity Portfolio Optimization with Market Data Integration
 */
export async function optimizeRiskParity(args = {}) {
  const {
    symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN'],
    method = 'standard', // 'standard', 'constrained', 'hierarchical'
    min_weights = null,
    max_weights = null,
    analysis_period = 252,
    max_iterations = 100,
    tolerance = 1e-6,
    use_market_data = true,
    include_comparison = true,
    benchmark_symbol = 'SPY'
  } = args;

  try {
    let report = `# Risk Parity Portfolio Optimization

## Configuration
- **Assets**: ${symbols.join(', ')}
- **Method**: ${method.replace('_', ' ').toUpperCase()}
- **Analysis Period**: ${analysis_period} days
- **Max Iterations**: ${max_iterations}
- **Tolerance**: ${tolerance}

`;

    if (!use_market_data) {
      report += `## Risk Parity Concept Overview

**Traditional Equal Weights Problems:**
- High volatility assets dominate portfolio risk
- Concentrated risk in few positions
- Poor risk-adjusted diversification

**Risk Parity Solution:**
- Each asset contributes equally to total portfolio risk
- Better diversification across risk sources
- More stable risk profile over time

### Theoretical Example (4 Assets):

**Equal Weight Portfolio:**
- Each asset: 25% weight
- Risk contributions: 45%, 30%, 15%, 10% (concentrated!)

**Risk Parity Portfolio:**
- Weights: 12%, 18%, 35%, 35%  
- Risk contributions: 25%, 25%, 25%, 25% (balanced!)

*Enable market data for real Risk Parity optimization.*

`;
      return { content: [{ type: "text", text: report }] };
    }

    // Fetch market data for all symbols
    report += `## Market Data Collection\n\n`;
    const assetData = {};
    const errors = [];

    for (const symbol of symbols) {
      try {
        const historicalData = await marketDataService.getHistoricalPrices(symbol, 'full');
        
        if (historicalData && historicalData.dates && historicalData.dates.length > 0) {
          const recentDates = historicalData.dates.slice(0, Math.min(analysis_period + 1, historicalData.dates.length));
          const prices = recentDates.map(date => historicalData.prices[date].close);
          
          assetData[symbol] = {
            prices: prices,
            returns: calculateReturns(prices, 'percentage'),
            dates: recentDates.slice(1),
            volatility: standardDeviation(calculateReturns(prices, 'percentage'))
          };

          report += `- **${symbol}**: ${prices.length} prices, Volatility: ${(assetData[symbol].volatility * 100).toFixed(1)}%\n`;
        } else {
          throw new Error('No historical data available');
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        errors.push({ symbol, error: error.message });
        report += `- **${symbol}**: ERROR - ${error.message}\n`;
      }
    }

    const availableSymbols = Object.keys(assetData);
    if (availableSymbols.length < 2) {
      report += `\nERROR: **Insufficient data for Risk Parity optimization**\n\nNeed at least 2 assets with historical data.`;
      return { content: [{ type: "text", text: report }] };
    }

    // Calculate returns matrix and covariance
    const returnsMatrix = availableSymbols.map(symbol => assetData[symbol].returns);
    const minLength = Math.min(...returnsMatrix.map(r => r.length));
    const alignedReturns = returnsMatrix.map(returns => returns.slice(0, minLength));
    const covarianceMatrix = calculateCovarianceMatrix(alignedReturns);

    // Display asset volatilities for context
    report += `\n## Asset Risk Profile\n\n`;
    report += `| Asset | Volatility | Relative Risk |\n`;
    report += `|-------|------------|---------------|\n`;
    
    const volatilities = availableSymbols.map(symbol => assetData[symbol].volatility);
    const avgVolatility = mean(volatilities);
    
    availableSymbols.forEach((symbol, i) => {
      const vol = volatilities[i];
      const relativeRisk = vol > avgVolatility * 1.2 ? 'HIGH' : 
                          vol < avgVolatility * 0.8 ? 'LOW' : 'MODERATE';
      report += `| ${symbol} | ${(vol * 100).toFixed(1)}% | ${relativeRisk} |\n`;
    });

    // Run Risk Parity optimization based on selected method
    let rpResult;
    let methodDescription = '';
    
    switch (method) {
      case 'constrained':
        const minWeights = min_weights || availableSymbols.map(() => 0.05);  // 5% minimum
        const maxWeights = max_weights || availableSymbols.map(() => 0.5);   // 50% maximum
        rpResult = optimizeConstrainedRiskParityCore(covarianceMatrix, minWeights, maxWeights, max_iterations, tolerance);
        methodDescription = 'Constrained Risk Parity with weight bounds';
        break;
        
      case 'hierarchical':
        rpResult = optimizeHierarchicalRiskParityCore(covarianceMatrix);
        methodDescription = 'Hierarchical Risk Parity with correlation clustering';
        break;
        
      default:
        rpResult = optimizeRiskParityCore(covarianceMatrix, null, max_iterations, tolerance);
        methodDescription = 'Standard Risk Parity optimization';
        break;
    }

    report += `\n## ${methodDescription}\n\n`;

    if (!rpResult.converged && rpResult.iterations) {
      report += `WARNING: **Optimization did not fully converge** after ${rpResult.iterations} iterations\n\n`;
    } else if (rpResult.iterations) {
      report += `SUCCESS: **Optimization converged** in ${rpResult.iterations} iterations\n\n`;
    }

    // Risk Parity results
    report += `### Risk Parity Portfolio Weights\n\n`;
    report += `| Asset | Weight | Risk Contribution | Target (Equal) |\n`;
    report += `|-------|--------|------------------|----------------|\n`;
    
    const targetRisk = 1 / availableSymbols.length;
    availableSymbols.forEach((symbol, i) => {
      const weight = rpResult.weights[i];
      const riskContrib = rpResult.riskContributions[i];
      const deviation = Math.abs(riskContrib - targetRisk);
      const deviationIcon = deviation < 0.02 ? '[OK]' : deviation < 0.05 ? '[WARN]' : '[HIGH]';
      
      report += `| ${symbol} ${deviationIcon} | ${(weight * 100).toFixed(1)}% | ${(riskContrib * 100).toFixed(1)}% | ${(targetRisk * 100).toFixed(1)}% |\n`;
    });

    // Risk parity quality metrics
    if (rpResult.riskContributionStats) {
      const stats = rpResult.riskContributionStats;
      report += `\n### Risk Parity Quality Assessment\n`;
      report += `- **Risk Parity Score**: ${(rpResult.riskParityScore * 100).toFixed(1)}% (higher = better)\n`;
      report += `- **Risk Contribution Range**: ${(stats.min * 100).toFixed(1)}% - ${(stats.max * 100).toFixed(1)}%\n`;
      report += `- **Risk Contribution Std Dev**: ${(stats.std * 100).toFixed(2)}%\n`;
      
      if (stats.range < 0.1) {
        report += `- **Excellent risk parity** (range < 10%)\n`;
      } else if (stats.range < 0.2) {
        report += `- **Good risk parity** (range < 20%)\n`;
      } else {
        report += `- **Poor risk parity** (range > 20%)\n`;
      }
    }

    // Portfolio metrics
    const portfolioReturn = mean(alignedReturns.map((returns, i) => 
      mean(returns) * rpResult.weights[i]
    ));
    const sharpeRatio = calculateSharpeRatio(portfolioReturn, rpResult.portfolioVolatility);
    
    report += `\n### Portfolio Performance Metrics\n`;
    report += `- **Portfolio Volatility**: ${(rpResult.portfolioVolatility * 100).toFixed(2)}%\n`;
    report += `- **Expected Return**: ${(portfolioReturn * 100).toFixed(2)}%\n`;
    report += `- **Sharpe Ratio**: ${sharpeRatio.toFixed(3)}\n`;

    // Comparison with equal weights
    if (include_comparison) {
      const equalWeights = new Array(availableSymbols.length).fill(1 / availableSymbols.length);
      const equalWeightRC = calculateRiskContributions(equalWeights, covarianceMatrix);
      const equalWeightVol = calculatePortfolioVolatility(equalWeights, covarianceMatrix);
      const equalWeightReturn = mean(alignedReturns.map((returns, i) => mean(returns) * equalWeights[i]));
      const equalWeightSharpe = calculateSharpeRatio(equalWeightReturn, equalWeightVol);

      report += `\n### Comparison: Risk Parity vs Equal Weights\n\n`;
      report += `| Metric | Equal Weights | Risk Parity | Improvement |\n`;
      report += `|--------|---------------|-------------|-------------|\n`;
      report += `| Portfolio Volatility | ${(equalWeightVol * 100).toFixed(2)}% | ${(rpResult.portfolioVolatility * 100).toFixed(2)}% | ${((rpResult.portfolioVolatility - equalWeightVol) * 100).toFixed(2)}% |\n`;
      report += `| Expected Return | ${(equalWeightReturn * 100).toFixed(2)}% | ${(portfolioReturn * 100).toFixed(2)}% | ${((portfolioReturn - equalWeightReturn) * 100).toFixed(2)}% |\n`;
      report += `| Sharpe Ratio | ${equalWeightSharpe.toFixed(3)} | ${sharpeRatio.toFixed(3)} | ${(sharpeRatio - equalWeightSharpe).toFixed(3)} |\n`;

      // Risk contribution comparison
      report += `\n### Risk Contribution Comparison\n\n`;
      report += `| Asset | Equal Weight RC | Risk Parity RC | Improvement |\n`;
      report += `|-------|----------------|----------------|-------------|\n`;
      
      availableSymbols.forEach((symbol, i) => {
        const ewRC = equalWeightRC[i];
        const rpRC = rpResult.riskContributions[i];
        const improvement = Math.abs(rpRC - targetRisk) < Math.abs(ewRC - targetRisk) ? '[BETTER]' : '[WORSE]';
        
        report += `| ${symbol} | ${(ewRC * 100).toFixed(1)}% | ${(rpRC * 100).toFixed(1)}% | ${improvement} |\n`;
      });

      // Overall diversification benefit
      const ewRiskSpread = standardDeviation(equalWeightRC);
      const rpRiskSpread = standardDeviation(rpResult.riskContributions);
      const diversificationImprovement = (ewRiskSpread - rpRiskSpread) / ewRiskSpread;
      
      report += `\n### Diversification Analysis\n`;
      report += `- **Equal Weight Risk Spread**: ${(ewRiskSpread * 100).toFixed(2)}%\n`;
      report += `- **Risk Parity Risk Spread**: ${(rpRiskSpread * 100).toFixed(2)}%\n`;
      report += `- **Diversification Improvement**: ${(diversificationImprovement * 100).toFixed(1)}%\n`;
    }

    // Method-specific insights
    if (method === 'constrained' && rpResult.constraintsActive) {
      report += `\n### Constraint Analysis\n`;
      report += `- **Constraints Active**: Some assets hit weight bounds\n`;
      report += `- **Min Weights**: ${rpResult.minWeights.map(w => `${(w * 100).toFixed(0)}%`).join(', ')}\n`;
      report += `- **Max Weights**: ${rpResult.maxWeights.map(w => `${(w * 100).toFixed(0)}%`).join(', ')}\n`;
    }

    if (method === 'hierarchical' && rpResult.clusterTree) {
      report += `\n### Hierarchical Clustering\n`;
      report += `- **Clustering Method**: Correlation-based distance\n`;
      report += `- **Cluster Levels**: ${rpResult.clusterTree.length}\n`;
      report += `- **Final Clusters**: Assets grouped by correlation similarity\n`;
    }

    // Investment insights
    report += `\n## Investment Insights\n\n`;
    
    const maxWeightAsset = availableSymbols[rpResult.weights.indexOf(Math.max(...rpResult.weights))];
    const minWeightAsset = availableSymbols[rpResult.weights.indexOf(Math.min(...rpResult.weights))];
    const maxWeight = Math.max(...rpResult.weights);
    const minWeight = Math.min(...rpResult.weights);
    
    report += `### Portfolio Characteristics\n`;
    report += `- **Highest Weight**: ${maxWeightAsset} (${(maxWeight * 100).toFixed(1)}%)\n`;
    report += `- **Lowest Weight**: ${minWeightAsset} (${(minWeight * 100).toFixed(1)}%)\n`;
    report += `- **Weight Range**: ${(minWeight * 100).toFixed(1)}% - ${(maxWeight * 100).toFixed(1)}%\n`;

    // Risk-based insights
    const highVolAssets = availableSymbols.filter((_, i) => volatilities[i] > avgVolatility * 1.2);
    const lowVolAssets = availableSymbols.filter((_, i) => volatilities[i] < avgVolatility * 0.8);
    
    if (highVolAssets.length > 0) {
      const highVolWeights = highVolAssets.map(symbol => {
        const index = availableSymbols.indexOf(symbol);
        return rpResult.weights[index];
      });
      const avgHighVolWeight = mean(highVolWeights);
      
      report += `\n### Risk Management\n`;
      report += `- **High Volatility Assets** (${highVolAssets.join(', ')}): Average weight ${(avgHighVolWeight * 100).toFixed(1)}%\n`;
      
      if (avgHighVolWeight < 1 / availableSymbols.length) {
        report += `  - **Properly de-risked**: Lower weights for high-vol assets\n`;
      } else {
        report += `  - **Consider review**: High-vol assets still have significant weights\n`;
      }
    }

    if (errors.length > 0) {
      report += `\n### Data Issues\n`;
      errors.forEach(error => {
        report += `- **${error.symbol}**: ${error.error}\n`;
      });
    }

    report += `\n*Analysis completed at: ${new Date().toLocaleString()}*`;

    return {
      content: [{ type: "text", text: report }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error in Risk Parity optimization: ${error.message}\n\nStack: ${error.stack}`
      }]
    };
  }
}

/**
 * Compare multiple Risk Parity methods side by side
 */
export async function compareRiskParityMethods(args = {}) {
  const {
    symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN'],
    analysis_period = 252,
    use_market_data = true,
    include_hierarchical = true
  } = args;

  try {
    let report = `# Risk Parity Methods Comparison

## Portfolio: ${symbols.join(' • ')}
Analysis Period: ${analysis_period} trading days

`;

    if (!use_market_data) {
      report += `## Theoretical Comparison

### Methods Overview:

**1. Equal Weight**
- Simple: 25% each (for 4 assets)
- Problem: Risk concentrated in volatile assets

**2. Standard Risk Parity** 
- Target: Equal risk contribution from each asset
- Method: Iterative optimization

**3. Constrained Risk Parity**
- Risk Parity + weight bounds (e.g., 5%-50%)
- More practical for implementation

**4. Hierarchical Risk Parity**
- Groups assets by correlation
- Allocates within and across clusters

*Enable market data for detailed comparison.*

`;
      return { content: [{ type: "text", text: report }] };
    }

    // Fetch market data
    const assetData = {};
    let dataErrors = 0;

    for (const symbol of symbols) {
      try {
        const historicalData = await marketDataService.getHistoricalPrices(symbol, 'full');
        if (historicalData && historicalData.dates) {
          const recentDates = historicalData.dates.slice(0, analysis_period + 1);
          const prices = recentDates.map(date => historicalData.prices[date].close);
          assetData[symbol] = calculateReturns(prices, 'percentage');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        dataErrors++;
      }
    }

    const availableSymbols = Object.keys(assetData);
    if (availableSymbols.length < 2) {
      report += `ERROR: **Insufficient data**: Only ${availableSymbols.length} assets available\n`;
      return { content: [{ type: "text", text: report }] };
    }

    // Calculate covariance matrix
    const returnsMatrix = availableSymbols.map(symbol => assetData[symbol]);
    const minLength = Math.min(...returnsMatrix.map(r => r.length));
    const alignedReturns = returnsMatrix.map(returns => returns.slice(0, minLength));
    const covarianceMatrix = calculateCovarianceMatrix(alignedReturns);

    // Compare methods
    const comparison = compareRiskParityMethodsCore(covarianceMatrix, availableSymbols);
    const methods = comparison.methods;

    report += `## Method Comparison Results\n\n`;

    // Portfolio weights table
    report += `### Portfolio Weights\n\n`;
    report += `| Asset | Equal Weight | Risk Parity | Constrained RP |`;
    if (include_hierarchical && methods.hierarchical_risk_parity) {
      report += ` Hierarchical RP |`;
    }
    report += `\n|-------|--------------|-------------|----------------|`;
    if (include_hierarchical && methods.hierarchical_risk_parity) {
      report += `-----------------|`;
    }
    report += `\n`;

    availableSymbols.forEach((symbol, i) => {
      let row = `| ${symbol} |`;
      row += ` ${(methods.equal_weight?.weights[i] * 100 || 0).toFixed(1)}% |`;
      row += ` ${(methods.risk_parity?.weights[i] * 100 || 0).toFixed(1)}% |`;
      row += ` ${(methods.constrained_risk_parity?.weights[i] * 100 || 0).toFixed(1)}% |`;
      if (include_hierarchical && methods.hierarchical_risk_parity) {
        row += ` ${(methods.hierarchical_risk_parity.weights[i] * 100).toFixed(1)}% |`;
      }
      report += row + '\n';
    });

    // Risk contributions table
    report += `\n### Risk Contributions\n\n`;
    report += `| Asset | Equal Weight | Risk Parity | Constrained RP |`;
    if (include_hierarchical && methods.hierarchical_risk_parity) {
      report += ` Hierarchical RP |`;
    }
    report += `\n|-------|--------------|-------------|----------------|`;
    if (include_hierarchical && methods.hierarchical_risk_parity) {
      report += `-----------------|`;
    }
    report += `\n`;

    availableSymbols.forEach((symbol, i) => {
      let row = `| ${symbol} |`;
      row += ` ${(methods.equal_weight?.riskContributions[i] * 100 || 0).toFixed(1)}% |`;
      row += ` ${(methods.risk_parity?.riskContributions[i] * 100 || 0).toFixed(1)}% |`;
      row += ` ${(methods.constrained_risk_parity?.riskContributions[i] * 100 || 0).toFixed(1)}% |`;
      if (include_hierarchical && methods.hierarchical_risk_parity) {
        row += ` ${(methods.hierarchical_risk_parity.riskContributions[i] * 100).toFixed(1)}% |`;
      }
      report += row + '\n';
    });

    // Portfolio metrics comparison
    report += `\n### Portfolio Metrics\n\n`;
    report += `| Metric | Equal Weight | Risk Parity | Constrained RP |`;
    if (include_hierarchical && methods.hierarchical_risk_parity) {
      report += ` Hierarchical RP |`;
    }
    report += `\n|--------|--------------|-------------|----------------|`;
    if (include_hierarchical && methods.hierarchical_risk_parity) {
      report += `-----------------|`;
    }
    report += `\n`;

    const metrics = [
      ['Volatility', 'portfolioVolatility', '%'],
      ['Risk Parity Score', 'riskParityScore', '%']
    ];

    metrics.forEach(([label, key, unit]) => {
      let row = `| ${label} |`;
      
      Object.keys(methods).forEach(methodName => {
        const method = methods[methodName];
        if (method && method[key] !== undefined) {
          const value = unit === '%' ? (method[key] * 100).toFixed(2) + '%' : method[key].toFixed(3);
          row += ` ${value} |`;
        } else if (methodName === 'equal_weight') {
          // Don't show risk parity score for equal weight
          row += ` - |`;
        }
      });
      
      report += row + '\n';
    });

    // Risk distribution analysis
    report += `\n## Risk Distribution Analysis\n\n`;
    
    Object.keys(methods).forEach(methodName => {
      const method = methods[methodName];
      if (method && method.riskContributions) {
        const riskStd = standardDeviation(method.riskContributions);
        const riskRange = Math.max(...method.riskContributions) - Math.min(...method.riskContributions);
        
        report += `### ${methodName.replace('_', ' ').toUpperCase()}\n`;
        report += `- **Risk Spread (Std Dev)**: ${(riskStd * 100).toFixed(2)}%\n`;
        report += `- **Risk Range**: ${(riskRange * 100).toFixed(1)}%\n`;
        
        if (riskStd < 0.05) {
          report += `- **Excellent diversification** (low risk spread)\n`;
        } else if (riskStd < 0.1) {
          report += `- **Good diversification**\n`;
        } else {
          report += `- **Poor diversification** (high risk concentration)\n`;
        }
        report += `\n`;
      }
    });

    // Recommendations
    report += `## Method Recommendations\n\n`;
    
    const bestRiskParity = Object.keys(methods).reduce((best, methodName) => {
      const method = methods[methodName];
      if (methodName !== 'equal_weight' && method && method.riskParityScore) {
        if (!best || method.riskParityScore > methods[best].riskParityScore) {
          return methodName;
        }
      }
      return best;
    }, null);

    if (bestRiskParity) {
      report += `**Best Risk Parity Method**: ${bestRiskParity.replace('_', ' ').toUpperCase()}\n`;
      const bestMethod = methods[bestRiskParity];
      report += `- Risk Parity Score: ${(bestMethod.riskParityScore * 100).toFixed(1)}%\n`;
      report += `- Portfolio Volatility: ${(bestMethod.portfolioVolatility * 100).toFixed(2)}%\n\n`;
    }

    report += `### Use Case Guidelines:\n`;
    report += `- **Standard Risk Parity**: Best for unconstrained institutional portfolios\n`;
    report += `- **Constrained Risk Parity**: Practical for retail and regulated portfolios\n`;
    report += `- **Hierarchical Risk Parity**: Good for highly correlated asset classes\n`;
    report += `- **Equal Weight**: Simple baseline, poor risk distribution\n`;

    if (dataErrors > 0) {
      report += `\n**Data Issues**: ${dataErrors} symbols failed to load data\n`;
    }

    report += `\n*Comparison completed at: ${new Date().toLocaleString()}*`;

    return {
      content: [{ type: "text", text: report }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error in Risk Parity comparison: ${error.message}`
      }]
    };
  }
}