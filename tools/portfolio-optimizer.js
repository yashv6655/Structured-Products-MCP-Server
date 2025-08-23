import marketDataService from '../services/market-data.js';
import {
  calculateReturns,
  calculateCovarianceMatrix,
  calculateCorrelationMatrix,
  calculatePortfolioReturn,
  calculatePortfolioVolatility,
  calculateSharpeRatio,
  optimizePortfolioMinVariance,
  calculateEfficientFrontier,
  findMaxSharpePortfolio,
  calculateVaR,
  calculateExpectedShortfall,
  calculateMaxDrawdown,
  calculateRollingStats
} from '../utils/portfolio-math.js';
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  generateTradingSignals,
  calculateTrend,
  findSupportResistance
} from '../utils/technical-analysis.js';
import { mean } from 'simple-statistics';

/**
 * Build and optimize multi-asset portfolios using real market data
 */
export async function buildPortfolio(args = {}) {
  const {
    symbols = ['AAPL', 'MSFT', 'GOOGL'],
    target_return = 0.12,
    risk_tolerance = 0.6,
    optimization_method = 'max_sharpe',
    use_market_data = true,
    time_horizon = 252, // Trading days (1 year)
    risk_free_rate = null,
    constraints = {}
  } = args;

  try {
    let report = `# Portfolio Construction & Optimization

## Portfolio Configuration
- **Symbols**: ${symbols.join(', ')}
- **Target Return**: ${(target_return * 100).toFixed(1)}%
- **Risk Tolerance**: ${risk_tolerance}
- **Optimization Method**: ${optimization_method}
- **Time Horizon**: ${time_horizon} days
- **Use Real Market Data**: ${use_market_data ? 'Yes' : 'No'}

`;

    // Create simple portfolio for testing without market data
    if (!use_market_data) {
      report += `## Static Portfolio Analysis

Using theoretical parameters for portfolio optimization.

### Equal Weight Portfolio
`;
      
      const equalWeight = 1.0 / symbols.length;
      symbols.forEach(symbol => {
        report += `- **${symbol}**: ${(equalWeight * 100).toFixed(1)}%\n`;
      });
      
      report += `
*Analysis completed at: ${new Date().toLocaleString()}*`;
      
      return {
        content: [
          {
            type: "text",
            text: report
          }
        ]
      };
    }

    // Market data integration (simplified for now)
    const marketData = {};
    
    report += `## Market Data Collection

`;
    
    for (const symbol of symbols) {
      try {
        const currentPrice = await marketDataService.getCurrentPrice(symbol);
        marketData[symbol] = {
          currentPrice: currentPrice,
          price: currentPrice.price,
          change: currentPrice.changePercent
        };
        
        report += `- **${symbol}**: $${currentPrice.price} (${currentPrice.changePercent})\n`;
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        report += `- **${symbol}**: ERROR - Failed to fetch data (${error.message})\n`;
      }
    }
    
    // Simple equal weight allocation for now
    report += `
## Portfolio Allocation (Equal Weight)

`;
    
    const weight = 1.0 / symbols.length;
    let totalValue = 0;
    
    Object.keys(marketData).forEach(symbol => {
      const allocation = weight * 100;
      totalValue += marketData[symbol].price * weight;
      report += `- **${symbol}**: ${allocation.toFixed(1)}% ($${marketData[symbol].price})\n`;
    });
    
    report += `
### Portfolio Summary
- **Total Symbols**: ${Object.keys(marketData).length}
- **Portfolio Value** (per $1 invested): $${totalValue.toFixed(2)}
- **Equal Weight Strategy**: ${weight.toFixed(3)} per asset

*Analysis completed at: ${new Date().toLocaleString()}*`;
    
    return {
      content: [
        {
          type: "text",
          text: report
        }
      ]
    };
    
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error building portfolio: ${error.message}`
        }
      ]
    };
  }
}

/**
 * Analyze individual stock with technical indicators and investment signals
 */
export async function analyzeStock(args = {}) {
  const {
    symbol = 'AAPL',
    analysis_period = 90,
    include_technical = true,
    include_fundamentals = true,
    signal_strength = 'medium'
  } = args;
  
  try {
    let report = `# Stock Investment Analysis: ${symbol}

`;
    
    // Fetch current market data
    const currentPrice = await marketDataService.getCurrentPrice(symbol);
    
    report += `## Current Market Data

- **Current Price**: $${currentPrice.price}
- **Daily Change**: ${currentPrice.changePercent}
- **Volume**: ${currentPrice.volume.toLocaleString()}
- **Day Range**: $${currentPrice.low} - $${currentPrice.high}

`;
    
    // Get company fundamentals if requested
    if (include_fundamentals) {
      try {
        const overview = await marketDataService.getCompanyOverview(symbol);
        
        report += `## Fundamental Analysis

- **Company**: ${overview.name}
- **Sector**: ${overview.sector}
- **Market Cap**: ${overview.marketCap ? '$' + (overview.marketCap / 1e9).toFixed(1) + 'B' : 'N/A'}
- **P/E Ratio**: ${overview.peRatio || 'N/A'}
- **Beta**: ${overview.beta || 'N/A'}
- **Dividend Yield**: ${overview.dividendYield ? (overview.dividendYield * 100).toFixed(2) + '%' : 'N/A'}

`;
        
        // Simple investment signals based on fundamentals
        const signals = [];
        const warnings = [];
        
        if (overview.peRatio && overview.peRatio < 15) {
          signals.push('Low P/E ratio suggests potential value');
        } else if (overview.peRatio && overview.peRatio > 30) {
          warnings.push('High P/E ratio may indicate overvaluation');
        }
        
        if (overview.dividendYield && overview.dividendYield > 0.03) {
          signals.push('Dividend yield above 3% provides income');
        }
        
        if (overview.beta && overview.beta < 1.2) {
          signals.push('Low beta indicates lower market sensitivity');
        } else if (overview.beta && overview.beta > 1.5) {
          warnings.push('High beta indicates higher volatility');
        }
        
        report += `## Investment Decision Framework

### Buy Signals
`;
        if (signals.length > 0) {
          signals.forEach(signal => report += `- ${signal}\n`);
        } else {
          report += `- No strong buy signals identified\n`;
        }
        
        report += `
### Risk Factors
`;
        if (warnings.length > 0) {
          warnings.forEach(warning => report += `- ${warning}\n`);
        } else {
          report += `- No major risk factors identified\n`;
        }
        
        // Overall recommendation
        const bullishSignals = signals.length;
        const bearishSignals = warnings.length;
        
        report += `
### Overall Investment Recommendation

`;
        
        if (bullishSignals > bearishSignals + 1) {
          report += `**BUY** - Multiple positive signals outweigh concerns\n`;
        } else if (bullishSignals > bearishSignals) {
          report += `**LEAN BUY** - More positives than negatives, but monitor closely\n`;
        } else if (bearishSignals > bullishSignals + 1) {
          report += `**AVOID/SELL** - Significant risk factors identified\n`;
        } else if (bearishSignals > bullishSignals) {
          report += `**LEAN SELL** - More concerns than positives\n`;
        } else {
          report += `↔️ **HOLD/NEUTRAL** - Mixed signals, await clearer direction\n`;
        }
        
      } catch (error) {
        report += `WARNING: Could not fetch fundamental data: ${error.message}\n\n`;
      }
    }
    
    report += `
*Analysis completed at: ${new Date().toLocaleString()}*`;
    
    return {
      content: [
        {
          type: "text",
          text: report
        }
      ]
    };
    
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error analyzing stock ${symbol}: ${error.message}`
        }
      ]
    };
  }
}