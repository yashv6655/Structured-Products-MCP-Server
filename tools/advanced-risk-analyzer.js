import marketDataService from '../services/market-data.js';
import {
  calculateReturns,
  calculateCovarianceMatrix,
  calculateCorrelationMatrix,
  calculateAdvancedRiskMetrics,
  calculatePortfolioBeta,
  calculateDownsideDeviation,
  calculateSortinoRatio,
  calculateTreynorRatio,
  calculateInformationRatio,
  calculateCalmarRatio,
  calculateMaxDrawdown,
  calculateRollingStats
} from '../utils/portfolio-math.js';
import { mean, standardDeviation } from 'simple-statistics';

/**
 * Advanced Portfolio Risk Analysis with FinQuant-inspired metrics
 */
export async function analyzeAdvancedRisk(args = {}) {
  const {
    symbols = ['AAPL', 'MSFT', 'GOOGL'],
    weights = null,
    benchmark_symbol = 'SPY',
    analysis_period = 252, // 1 year of trading days
    risk_free_rate = null,
    confidence_levels = [0.95, 0.99],
    include_attribution = true,
    rolling_window = 30,
    use_market_data = true
  } = args;

  try {
    let report = `# Advanced Portfolio Risk Analysis
    
## Portfolio Configuration
- **Assets**: ${symbols.join(', ')}
- **Benchmark**: ${benchmark_symbol}
- **Analysis Period**: ${analysis_period} trading days
- **Confidence Levels**: ${confidence_levels.map(c => `${(c * 100).toFixed(0)}%`).join(', ')}
- **Rolling Window**: ${rolling_window} days

`;

    if (!use_market_data) {
      report += `## Theoretical Analysis Mode

Using simulated data for risk analysis demonstration.

### Sample Risk Metrics
- **Sharpe Ratio**: 1.25
- **Sortino Ratio**: 1.68
- **Maximum Drawdown**: -15.4%
- **VaR (95%)**: -2.1%
- **Expected Shortfall (95%)**: -3.2%

*Switch to market data mode for real analysis.*

`;
      return {
        content: [{ type: "text", text: report }]
      };
    }

    // Determine portfolio weights
    const portfolioWeights = weights || new Array(symbols.length).fill(1 / symbols.length);
    if (portfolioWeights.length !== symbols.length) {
      throw new Error('Weights array must match number of symbols');
    }

    report += `### Portfolio Allocation
`;
    symbols.forEach((symbol, i) => {
      report += `- **${symbol}**: ${(portfolioWeights[i] * 100).toFixed(1)}%\n`;
    });

    // Fetch market data for portfolio assets
    report += `\n## Market Data Collection\n\n`;
    const assetData = {};
    const errors = [];

    for (const symbol of symbols) {
      try {
        const historicalData = await marketDataService.getHistoricalPrices(symbol, 'full');
        
        if (historicalData && historicalData.dates && historicalData.dates.length > 0) {
          // Extract closing prices for the analysis period
          const recentDates = historicalData.dates.slice(0, Math.min(analysis_period + 1, historicalData.dates.length));
          const prices = recentDates.map(date => historicalData.prices[date].close);
          
          assetData[symbol] = {
            prices: prices,
            returns: calculateReturns(prices, 'percentage'),
            dates: recentDates.slice(1) // Remove first date as we lose one observation for returns
          };
          
          report += `- **${symbol}**: ${prices.length} price points, latest: $${prices[0].toFixed(2)}\n`;
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

    if (Object.keys(assetData).length === 0) {
      report += `\nWARNING: **No market data available for analysis**\n\nPlease check API connectivity and symbol validity.`;
      return { content: [{ type: "text", text: report }] };
    }

    // Calculate portfolio returns
    const availableAssets = Object.keys(assetData);
    const adjustedWeights = availableAssets.map(symbol => {
      const index = symbols.indexOf(symbol);
      return portfolioWeights[index];
    });

    // Normalize weights
    const weightSum = adjustedWeights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = adjustedWeights.map(w => w / weightSum);

    // Calculate portfolio returns time series
    const minLength = Math.min(...availableAssets.map(symbol => assetData[symbol].returns.length));
    const portfolioReturns = [];

    for (let i = 0; i < minLength; i++) {
      let portfolioReturn = 0;
      for (let j = 0; j < availableAssets.length; j++) {
        const symbol = availableAssets[j];
        portfolioReturn += normalizedWeights[j] * assetData[symbol].returns[i];
      }
      portfolioReturns.push(portfolioReturn);
    }

    // Get benchmark data if specified
    let benchmarkReturns = null;
    if (benchmark_symbol && benchmark_symbol !== 'NONE') {
      try {
        const benchmarkData = await marketDataService.getHistoricalPrices(benchmark_symbol, 'full');
        if (benchmarkData && benchmarkData.dates) {
          const recentDates = benchmarkData.dates.slice(0, Math.min(analysis_period + 1, benchmarkData.dates.length));
          const benchmarkPrices = recentDates.map(date => benchmarkData.prices[date].close);
          benchmarkReturns = calculateReturns(benchmarkPrices, 'percentage').slice(0, minLength);
          
          report += `- **${benchmark_symbol} (Benchmark)**: ${benchmarkPrices.length} price points\n`;
        }
      } catch (error) {
        report += `- **${benchmark_symbol} (Benchmark)**: ERROR - ${error.message}\n`;
      }
    }

    // Get risk-free rate if not provided
    let riskFreeRate = risk_free_rate;
    if (riskFreeRate === null) {
      try {
        const treasuryData = await marketDataService.getRiskFreeRate('10year');
        riskFreeRate = treasuryData.rate;
        report += `- **Risk-Free Rate**: ${(riskFreeRate * 100).toFixed(2)}%\n`;
      } catch (error) {
        riskFreeRate = 0.05; // 5% fallback
        report += `- **Risk-Free Rate**: 5.00% (fallback)\n`;
      }
    }

    // Calculate comprehensive risk metrics
    const riskMetrics = calculateAdvancedRiskMetrics(portfolioReturns, benchmarkReturns, riskFreeRate);

    report += `\n## Advanced Risk Analysis Results\n\n`;

    // Performance metrics
    report += `### Performance Metrics\n`;
    report += `- **Total Return**: ${(riskMetrics.totalReturn * 100).toFixed(2)}% (average)\n`;
    report += `- **Volatility**: ${(riskMetrics.volatility * 100).toFixed(2)}%\n`;
    report += `- **Sharpe Ratio**: ${riskMetrics.sharpeRatio.toFixed(3)}\n`;
    if (riskMetrics.treynorRatio) {
      report += `- **Treynor Ratio**: ${riskMetrics.treynorRatio.toFixed(3)}\n`;
    }

    // Downside risk metrics
    report += `\n### Downside Risk Analysis\n`;
    report += `- **Sortino Ratio**: ${riskMetrics.sortinoRatio.toFixed(3)}\n`;
    report += `- **Downside Deviation**: ${(riskMetrics.downsideDeviation * 100).toFixed(2)}%\n`;
    report += `- **Semi-Variance**: ${(riskMetrics.semiVariance * 100).toFixed(4)}%\n`;
    report += `- **Upside Potential Ratio**: ${riskMetrics.upsidePotentialRatio.toFixed(3)}\n`;

    // Drawdown analysis
    report += `\n### Drawdown Analysis\n`;
    report += `- **Maximum Drawdown**: ${(riskMetrics.maxDrawdown * 100).toFixed(2)}%\n`;
    report += `- **Calmar Ratio**: ${riskMetrics.calmarRatio.toFixed(3)}\n`;
    report += `- **Recovery Period**: ${riskMetrics.drawdownPeriod} days\n`;

    // Value at Risk
    report += `\n### Value at Risk (VaR)\n`;
    for (const cl of confidence_levels) {
      const varKey = `var${(cl * 100).toFixed(0)}`;
      const esKey = `expectedShortfall${(cl * 100).toFixed(0)}`;
      if (riskMetrics[varKey] !== undefined) {
        report += `- **VaR (${(cl * 100).toFixed(0)}%)**: ${(riskMetrics[varKey] * 100).toFixed(2)}%\n`;
        report += `- **Expected Shortfall (${(cl * 100).toFixed(0)}%)**: ${(riskMetrics[esKey] * 100).toFixed(2)}%\n`;
      }
    }

    // Benchmark comparison
    if (benchmarkReturns && riskMetrics.beta !== undefined) {
      report += `\n### Benchmark Analysis (vs ${benchmark_symbol})\n`;
      report += `- **Beta**: ${riskMetrics.beta.toFixed(3)}\n`;
      report += `- **Information Ratio**: ${riskMetrics.informationRatio.toFixed(3)}\n`;
      report += `- **Tracking Error**: ${(riskMetrics.trackingError * 100).toFixed(2)}%\n`;
      report += `- **Excess Return**: ${(riskMetrics.excessReturn * 100).toFixed(2)}%\n`;
      report += `- **Benchmark Return**: ${(riskMetrics.benchmarkReturn * 100).toFixed(2)}%\n`;
    }

    // Rolling risk analysis
    if (rolling_window > 0 && portfolioReturns.length >= rolling_window) {
      const rollingStats = calculateRollingStats(portfolioReturns, rolling_window);
      const recentStats = rollingStats.slice(-5); // Last 5 rolling periods
      
      report += `\n### Rolling Risk Analysis (${rolling_window}-day window)\n`;
      report += `- **Current Rolling Volatility**: ${(recentStats[recentStats.length - 1].std * 100).toFixed(2)}%\n`;
      report += `- **Average Rolling Volatility**: ${(mean(rollingStats.map(s => s.std)) * 100).toFixed(2)}%\n`;
      report += `- **Volatility Range**: ${(Math.min(...rollingStats.map(s => s.std)) * 100).toFixed(2)}% - ${(Math.max(...rollingStats.map(s => s.std)) * 100).toFixed(2)}%\n`;
    }

    // Risk interpretation
    report += `\n## Risk Assessment Summary\n\n`;
    
    // Risk level classification
    let riskLevel = 'MODERATE';
    let riskColor = '[MODERATE]';
    
    if (riskMetrics.volatility > 0.25) {
      riskLevel = 'HIGH';
      riskColor = '[HIGH]';
    } else if (riskMetrics.volatility < 0.15) {
      riskLevel = 'LOW';
      riskColor = '[LOW]';
    }

    report += `### ${riskColor} Overall Risk Level: ${riskLevel}\n\n`;

    // Key insights
    report += `### Key Risk Insights:\n`;
    
    if (riskMetrics.sharpeRatio > 1.0) {
      report += `- **Strong risk-adjusted returns** (Sharpe > 1.0)\n`;
    } else {
      report += `- **Moderate risk-adjusted returns** (Sharpe < 1.0)\n`;
    }
    
    if (riskMetrics.sortinoRatio > riskMetrics.sharpeRatio * 1.2) {
      report += `- **Good downside risk management** (Sortino significantly > Sharpe)\n`;
    }
    
    if (riskMetrics.maxDrawdown > 0.20) {
      report += `- **High drawdown risk** (Max DD > 20%)\n`;
    } else if (riskMetrics.maxDrawdown < 0.10) {
      report += `- **Low drawdown risk** (Max DD < 10%)\n`;
    }

    if (riskMetrics.beta && Math.abs(riskMetrics.beta - 1.0) < 0.2) {
      report += `- **Market-neutral beta** (β ≈ 1.0)\n`;
    } else if (riskMetrics.beta > 1.2) {
      report += `- **High market sensitivity** (β > 1.2)\n`;
    } else if (riskMetrics.beta < 0.8) {
      report += `- **Low market sensitivity** (β < 0.8)\n`;
    }

    if (errors.length > 0) {
      report += `\n### Data Collection Issues:\n`;
      errors.forEach(err => {
        report += `- **${err.symbol}**: ${err.error}\n`;
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
        text: `Error in advanced risk analysis: ${error.message}\n\nStack: ${error.stack}`
      }]
    };
  }
}

/**
 * Risk Attribution Analysis - decompose portfolio risk by factor
 */
export async function analyzeRiskAttribution(args = {}) {
  const {
    symbols = ['AAPL', 'MSFT', 'GOOGL'],
    weights = null,
    analysis_period = 252,
    attribution_factors = ['market', 'sector', 'specific'],
    use_market_data = true
  } = args;

  try {
    let report = `# Portfolio Risk Attribution Analysis

## Configuration
- **Assets**: ${symbols.join(', ')}
- **Analysis Period**: ${analysis_period} days
- **Attribution Factors**: ${attribution_factors.join(', ')}

`;

    if (!use_market_data) {
      report += `## Theoretical Attribution Example

### Risk Decomposition
- **Market Risk**: 65% of total risk
- **Sector Risk**: 25% of total risk  
- **Specific Risk**: 10% of total risk

### Factor Contributions
- **Technology Sector**: 45% weight, 2.3% risk contribution
- **Market Beta**: 1.15, 5.2% risk contribution
- **Idiosyncratic**: Individual stock risks

*Enable market data for detailed attribution analysis.*

`;
      return { content: [{ type: "text", text: report }] };
    }

    // Portfolio weights
    const portfolioWeights = weights || new Array(symbols.length).fill(1 / symbols.length);

    // Fetch correlation matrix for risk decomposition
    const assetData = {};
    for (const symbol of symbols) {
      try {
        const historicalData = await marketDataService.getHistoricalPrices(symbol, 'compact');
        if (historicalData && historicalData.dates) {
          const prices = historicalData.dates.slice(0, analysis_period + 1).map(date => 
            historicalData.prices[date].close
          );
          assetData[symbol] = calculateReturns(prices, 'percentage');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        report += `WARNING: Could not fetch data for ${symbol}: ${error.message}\n`;
      }
    }

    const availableAssets = Object.keys(assetData);
    if (availableAssets.length < 2) {
      report += `\nERROR: **Insufficient data for attribution analysis**\n\nNeed at least 2 assets with historical data.`;
      return { content: [{ type: "text", text: report }] };
    }

    // Calculate correlation matrix
    const returnsMatrix = availableAssets.map(symbol => assetData[symbol]);
    const covMatrix = calculateCovarianceMatrix(returnsMatrix);
    const corrMatrix = calculateCorrelationMatrix(covMatrix);

    report += `## Risk Decomposition Results\n\n`;

    // Calculate marginal risk contributions
    report += `### Marginal Risk Contributions\n`;
    
    const adjustedWeights = availableAssets.map(symbol => {
      const index = symbols.indexOf(symbol);
      return portfolioWeights[index] || 0;
    });

    // Normalize weights
    const weightSum = adjustedWeights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = adjustedWeights.map(w => w / weightSum);

    for (let i = 0; i < availableAssets.length; i++) {
      const symbol = availableAssets[i];
      const weight = normalizedWeights[i];
      const assetVol = standardDeviation(assetData[symbol]);
      
      // Simple risk contribution calculation
      let riskContribution = 0;
      for (let j = 0; j < availableAssets.length; j++) {
        riskContribution += normalizedWeights[j] * covMatrix.get(i, j);
      }
      
      const marginalRisk = riskContribution / Math.sqrt(
        normalizedWeights.reduce((sum, w, k) => 
          sum + w * normalizedWeights.reduce((innerSum, w2, l) => 
            innerSum + w2 * covMatrix.get(k, l), 0
          ), 0
        )
      );
      
      report += `- **${symbol}**: Weight ${(weight * 100).toFixed(1)}%, Volatility ${(assetVol * 100).toFixed(1)}%, Marginal Risk ${(marginalRisk * 100).toFixed(2)}%\n`;
    }

    // Correlation analysis
    report += `\n### Asset Correlation Matrix\n`;
    report += `\n| Asset | ${availableAssets.join(' | ')} |\n`;
    report += `|${Array(availableAssets.length + 1).fill('---').join('|')}|\n`;
    
    for (let i = 0; i < availableAssets.length; i++) {
      let row = `| ${availableAssets[i]} |`;
      for (let j = 0; j < availableAssets.length; j++) {
        row += ` ${corrMatrix.get(i, j).toFixed(3)} |`;
      }
      report += `${row}\n`;
    }

    // Diversification benefits
    const avgCorrelation = corrMatrix.to2DArray()
      .flat()
      .filter((val, idx) => Math.floor(idx / availableAssets.length) !== idx % availableAssets.length)
      .reduce((sum, val) => sum + val, 0) / (availableAssets.length * (availableAssets.length - 1));

    report += `\n### Diversification Analysis\n`;
    report += `- **Average Correlation**: ${avgCorrelation.toFixed(3)}\n`;
    
    if (avgCorrelation < 0.3) {
      report += `- **Well diversified** (low correlation)\n`;
    } else if (avgCorrelation > 0.7) {
      report += `- **Poor diversification** (high correlation)\n`;
    } else {
      report += `- **Moderate diversification**\n`;
    }

    const diversificationRatio = normalizedWeights.reduce((sum, w, i) => 
      sum + w * standardDeviation(assetData[availableAssets[i]]), 0
    ) / Math.sqrt(
      normalizedWeights.reduce((sum, w, i) => 
        sum + w * normalizedWeights.reduce((innerSum, w2, j) => 
          innerSum + w2 * covMatrix.get(i, j), 0
        ), 0
      )
    );

    report += `- **Diversification Ratio**: ${diversificationRatio.toFixed(3)} (higher = better diversification)\n`;

    report += `\n*Analysis completed at: ${new Date().toLocaleString()}*`;

    return {
      content: [{ type: "text", text: report }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error in risk attribution analysis: ${error.message}`
      }]
    };
  }
}