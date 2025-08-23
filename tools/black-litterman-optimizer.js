import marketDataService from '../services/market-data.js';
import {
  calculateReturns,
  calculateCovarianceMatrix,
  blackLittermanOptimization,
  calculateImpliedReturns,
  calculateMarketCapWeights,
  createBlackLittermanView,
  generateSampleViews,
  calculatePortfolioReturn,
  calculatePortfolioVolatility,
  calculateSharpeRatio,
  calculateAdvancedRiskMetrics
} from '../utils/portfolio-math.js';
import { mean } from 'simple-statistics';

/**
 * Black-Litterman Portfolio Optimization with Market Data Integration
 */
export async function optimizeBlackLitterman(args = {}) {
  const {
    symbols = ['AAPL', 'MSFT', 'GOOGL'],
    views = [],
    view_confidence = [],
    tau = 0.05,
    risk_aversion = 3.0,
    analysis_period = 252,
    use_market_data = true,
    auto_generate_views = false,
    market_cap_source = 'api', // 'api' or 'equal' or 'custom'
    custom_market_caps = null,
    include_comparison = true
  } = args;

  try {
    let report = `# Black-Litterman Portfolio Optimization

## Configuration
- **Assets**: ${symbols.join(', ')}
- **Number of Views**: ${views.length}
- **Tau (Prior Uncertainty)**: ${tau}
- **Risk Aversion**: ${risk_aversion}
- **Analysis Period**: ${analysis_period} days
- **Market Cap Source**: ${market_cap_source}

`;

    if (!use_market_data) {
      report += `## Theoretical Example

### Black-Litterman vs Traditional Optimization

**Traditional Mean-Variance Issues:**
- Extreme portfolio weights (often 100%+ in single assets)
- High sensitivity to input changes
- Unrealistic portfolio suggestions

**Black-Litterman Benefits:**
- Starts from market equilibrium (sensible baseline)
- Incorporates investor views systematically  
- Produces more stable, intuitive portfolios
- Handles estimation uncertainty better

### Sample Results
**Market Portfolio**: Equal weights (33.3% each)
**BL Portfolio with Views**: 
- Tech view: 40% AAPL, 35% MSFT, 25% GOOGL
- Implied Returns: 8.2%, 7.8%, 9.1%

*Enable market data for real optimization with current market conditions.*

`;
      return { content: [{ type: "text", text: report }] };
    }

    // Fetch market data for all symbols
    report += `## Market Data Collection\n\n`;
    const assetData = {};
    const marketCaps = [];
    const companyData = [];
    const errors = [];

    for (const symbol of symbols) {
      try {
        // Get historical prices
        const historicalData = await marketDataService.getHistoricalPrices(symbol, 'full');
        
        if (historicalData && historicalData.dates && historicalData.dates.length > 0) {
          const recentDates = historicalData.dates.slice(0, Math.min(analysis_period + 1, historicalData.dates.length));
          const prices = recentDates.map(date => historicalData.prices[date].close);
          
          assetData[symbol] = {
            prices: prices,
            returns: calculateReturns(prices, 'percentage'),
            dates: recentDates.slice(1)
          };

          // Get company overview for market cap
          try {
            const overview = await marketDataService.getCompanyOverview(symbol);
            marketCaps.push(overview.marketCap || 1000000000); // 1B fallback
            companyData.push(overview);
            
            report += `- **${symbol}**: ${prices.length} prices, Market Cap: $${(overview.marketCap / 1e9).toFixed(1)}B\n`;
          } catch (overviewError) {
            marketCaps.push(1000000000); // Default 1B market cap
            companyData.push({});
            report += `- **${symbol}**: ${prices.length} prices, Market Cap: Default\n`;
          }
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
      report += `\nERROR: **Insufficient data for Black-Litterman optimization**\n\nNeed at least 2 assets with historical data.`;
      return { content: [{ type: "text", text: report }] };
    }

    // Calculate market cap weights
    let marketCapWeights;
    if (market_cap_source === 'equal') {
      marketCapWeights = new Array(availableSymbols.length).fill(1 / availableSymbols.length);
    } else if (market_cap_source === 'custom' && custom_market_caps) {
      marketCapWeights = calculateMarketCapWeights(custom_market_caps.slice(0, availableSymbols.length));
    } else {
      // Use actual market caps
      const availableMarketCaps = availableSymbols.map(symbol => {
        const index = symbols.indexOf(symbol);
        return marketCaps[index] || 1000000000;
      });
      marketCapWeights = calculateMarketCapWeights(availableMarketCaps);
    }

    // Calculate returns matrix and covariance
    const returnsMatrix = availableSymbols.map(symbol => assetData[symbol].returns);
    const minLength = Math.min(...returnsMatrix.map(r => r.length));
    const alignedReturns = returnsMatrix.map(returns => returns.slice(0, minLength));
    const covarianceMatrix = calculateCovarianceMatrix(alignedReturns);

    report += `\n## Portfolio Analysis Setup\n\n`;
    report += `### Market Capitalization Weights\n`;
    availableSymbols.forEach((symbol, i) => {
      report += `- **${symbol}**: ${(marketCapWeights[i] * 100).toFixed(1)}%\n`;
    });

    // Calculate implied returns
    const impliedReturns = calculateImpliedReturns(marketCapWeights, covarianceMatrix, risk_aversion);
    
    report += `\n### Implied Equilibrium Returns\n`;
    availableSymbols.forEach((symbol, i) => {
      report += `- **${symbol}**: ${(impliedReturns[i] * 100).toFixed(2)}% (annual)\n`;
    });

    // Process investor views
    let processedViews = views;
    if (auto_generate_views && views.length === 0) {
      // Generate views from technical/fundamental analysis
      processedViews = generateSampleViews(availableSymbols, [], companyData.slice(0, availableSymbols.length));
      
      if (processedViews.length > 0) {
        report += `\n### Auto-Generated Investment Views\n`;
        processedViews.forEach((view, i) => {
          report += `- ${view.description} (confidence: ${(view.confidence * 100).toFixed(0)}%)\n`;
        });
      }
    }

    if (processedViews.length > 0) {
      report += `\n### Investor Views Applied\n`;
      processedViews.forEach((view, i) => {
        const confidenceLevel = view_confidence[i] || view.confidence || 0.25;
        report += `- **View ${i + 1}**: ${view.description || 'Custom view'} (confidence: ${(confidenceLevel * 100).toFixed(0)}%)\n`;
      });
    }

    // Run Black-Litterman optimization
    const blResult = blackLittermanOptimization(
      marketCapWeights,
      covarianceMatrix,
      processedViews,
      view_confidence,
      tau,
      risk_aversion
    );

    report += `\n## Black-Litterman Optimization Results\n\n`;

    // Portfolio weights comparison
    report += `### Portfolio Allocation\n\n`;
    report += `| Asset | Market Weight | BL Weight | Change |\n`;
    report += `|-------|---------------|-----------|--------|\n`;
    
    availableSymbols.forEach((symbol, i) => {
      const marketWeight = marketCapWeights[i];
      const blWeight = blResult.weights[i];
      const change = blWeight - marketWeight;
      const changeSign = change >= 0 ? '+' : '';
      
      report += `| ${symbol} | ${(marketWeight * 100).toFixed(1)}% | ${(blWeight * 100).toFixed(1)}% | ${changeSign}${(change * 100).toFixed(1)}% |\n`;
    });

    // Expected returns comparison
    report += `\n### Expected Returns\n\n`;
    report += `| Asset | Implied Return | BL Return | Adjustment |\n`;
    report += `|-------|----------------|-----------|------------|\n`;
    
    availableSymbols.forEach((symbol, i) => {
      const impliedReturn = impliedReturns[i];
      const blReturn = blResult.expectedReturns[i];
      const adjustment = blReturn - impliedReturn;
      const adjustmentSign = adjustment >= 0 ? '+' : '';
      
      report += `| ${symbol} | ${(impliedReturn * 100).toFixed(2)}% | ${(blReturn * 100).toFixed(2)}% | ${adjustmentSign}${(adjustment * 100).toFixed(2)}% |\n`;
    });

    // Portfolio metrics
    report += `\n### Portfolio Performance Metrics\n`;
    report += `- **Expected Return**: ${(blResult.portfolioReturn * 100).toFixed(2)}%\n`;
    report += `- **Volatility**: ${(blResult.portfolioVolatility * 100).toFixed(2)}%\n`;
    
    const riskFreeRate = 0.05; // Could fetch from Treasury API
    const sharpeRatio = calculateSharpeRatio(blResult.portfolioReturn, blResult.portfolioVolatility, riskFreeRate);
    report += `- **Sharpe Ratio**: ${sharpeRatio.toFixed(3)}\n`;

    // Market portfolio metrics for comparison
    if (include_comparison) {
      const marketReturn = calculatePortfolioReturn(marketCapWeights, impliedReturns);
      const marketVol = calculatePortfolioVolatility(marketCapWeights, covarianceMatrix);
      const marketSharpe = calculateSharpeRatio(marketReturn, marketVol, riskFreeRate);
      
      report += `\n### Comparison vs Market Portfolio\n`;
      report += `| Metric | Market Portfolio | Black-Litterman | Improvement |\n`;
      report += `|--------|------------------|-----------------|-------------|\n`;
      report += `| Return | ${(marketReturn * 100).toFixed(2)}% | ${(blResult.portfolioReturn * 100).toFixed(2)}% | ${((blResult.portfolioReturn - marketReturn) * 100).toFixed(2)}% |\n`;
      report += `| Volatility | ${(marketVol * 100).toFixed(2)}% | ${(blResult.portfolioVolatility * 100).toFixed(2)}% | ${((blResult.portfolioVolatility - marketVol) * 100).toFixed(2)}% |\n`;
      report += `| Sharpe Ratio | ${marketSharpe.toFixed(3)} | ${sharpeRatio.toFixed(3)} | ${(sharpeRatio - marketSharpe).toFixed(3)} |\n`;
    }

    // Model parameters
    report += `\n## Model Parameters & Diagnostics\n\n`;
    report += `- **Optimization Method**: ${blResult.method}\n`;
    report += `- **Tau (Prior Uncertainty)**: ${blResult.tau}\n`;
    report += `- **Risk Aversion**: ${blResult.riskAversion}\n`;
    report += `- **Number of Views**: ${blResult.views ? blResult.views.length : 0}\n`;
    
    if (blResult.error) {
      report += `- **Warning**: ${blResult.error}\n`;
    }

    // Investment insights
    report += `\n## Investment Insights\n\n`;
    
    const maxWeight = Math.max(...blResult.weights);
    const minWeight = Math.min(...blResult.weights);
    const maxWeightSymbol = availableSymbols[blResult.weights.indexOf(maxWeight)];
    const concentration = blResult.weights.map(w => w * w).reduce((sum, w2) => sum + w2, 0);
    
    report += `### Portfolio Characteristics\n`;
    report += `- **Largest Position**: ${maxWeightSymbol} (${(maxWeight * 100).toFixed(1)}%)\n`;
    report += `- **Weight Range**: ${(minWeight * 100).toFixed(1)}% - ${(maxWeight * 100).toFixed(1)}%\n`;
    report += `- **Concentration Score**: ${concentration.toFixed(3)} (lower = more diversified)\n`;

    if (processedViews.length > 0) {
      report += `\n### View Impact\n`;
      const totalWeightChange = blResult.weights.map((w, i) => Math.abs(w - marketCapWeights[i])).reduce((sum, change) => sum + change, 0);
      report += `- **Total Weight Shifts**: ${(totalWeightChange * 100).toFixed(1)}%\n`;
      
      if (totalWeightChange < 0.1) {
        report += `- **Low impact views** - Consider stronger views or higher confidence\n`;
      } else if (totalWeightChange > 0.3) {
        report += `- **High impact views** - Significant departure from market equilibrium\n`;
      } else {
        report += `- **Moderate impact views** - Balanced adjustment from market weights\n`;
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
        text: `Error in Black-Litterman optimization: ${error.message}\n\nStack: ${error.stack}`
      }]
    };
  }
}

/**
 * Create and test Black-Litterman views interactively
 */
export async function createBlackLittermanViews(args = {}) {
  const {
    symbols = ['AAPL', 'MSFT'],
    view_examples = true,
    technical_analysis = false,
    fundamental_analysis = false
  } = args;

  try {
    let report = `# Black-Litterman View Builder

## Understanding Investment Views

Investment views in Black-Litterman represent your beliefs about future asset performance that differ from market consensus.

### View Types:

**Absolute Views**: "I believe Asset X will return Y%"
- Example: "Apple will return 15% this year"
- Use when you have strong conviction about specific returns

**Relative Views**: "I believe Asset X will outperform Asset Y by Z%"  
- Example: "Microsoft will outperform Google by 3%"
- Use when you're more confident about relative performance

### Confidence Levels:
- **0.1 (10%)**: Weak conviction, market knows better
- **0.25 (25%)**: Moderate confidence (default)
- **0.5 (50%)**: Strong conviction
- **0.75+ (75%+)**: Very high confidence (use sparingly)

`;

    if (view_examples) {
      report += `## Example Views for ${symbols.join(' vs ')}\n\n`;

      // Generate sample views
      const sampleViews = [
        {
          type: 'absolute',
          asset_index: 0,
          return_expectation: 0.12,
          confidence: 0.3,
          description: `${symbols[0]} will deliver 12% returns due to strong product pipeline`
        },
        {
          type: 'relative',
          asset1_index: 0,
          asset2_index: 1,
          return_expectation: 0.05,
          confidence: 0.25,
          description: `${symbols[0]} will outperform ${symbols[1]} by 5% due to market leadership`
        }
      ];

      report += `### Sample View Configurations:\n\n`;
      
      sampleViews.forEach((view, i) => {
        report += `**View ${i + 1}**: ${view.description}\n`;
        report += `\`\`\`json\n${JSON.stringify(view, null, 2)}\n\`\`\`\n\n`;
      });

      report += `### View Impact Guidelines:\n`;
      report += `- **Conservative**: 1-3% expected returns, 10-25% confidence\n`;
      report += `- **Moderate**: 5-8% expected returns, 25-40% confidence\n`;
      report += `- **Aggressive**: 10%+ expected returns, 40%+ confidence\n`;
    }

    if (technical_analysis || fundamental_analysis) {
      report += `\n## Analysis-Based View Generation\n\n`;
      
      if (technical_analysis) {
        report += `### Technical Analysis Views\n`;
        report += `- RSI < 30: Oversold, expect 3-5% bounce (confidence: 0.2)\n`;
        report += `- Golden Cross: 20-day > 50-day MA, expect 2-4% outperformance (confidence: 0.15)\n`;
        report += `- Breakout: Price above resistance, expect 5-8% upside (confidence: 0.3)\n\n`;
      }
      
      if (fundamental_analysis) {
        report += `### Fundamental Analysis Views\n`;
        report += `- Low P/E (<15): Value opportunity, expect 3-6% outperformance (confidence: 0.25)\n`;
        report += `- High dividend yield (>4%): Income premium, expect 2-3% outperformance (confidence: 0.2)\n`;
        report += `- Strong earnings growth: Expect 5-10% outperformance (confidence: 0.35)\n\n`;
      }
    }

    report += `## View Construction Best Practices\n\n`;
    report += `### Do's:\n`;
    report += `- Start with moderate confidence (20-30%)\n`;
    report += `- Base views on concrete analysis\n`;
    report += `- Use relative views when uncertain about absolute levels\n`;
    report += `- Consider multiple scenarios\n`;

    report += `\n### Don'ts:\n`;
    report += `- Avoid extreme confidence (>70%) without strong evidence\n`;
    report += `- Avoid contradictory views\n`;
    report += `- Don't ignore market consensus entirely\n`;
    report += `- Avoid too many views (3-5 is typically optimal)\n`;

    report += `\n## Next Steps\n\n`;
    report += `1. **Define Your Views**: Create 1-3 investment views based on your analysis\n`;
    report += `2. **Set Confidence**: Choose appropriate confidence levels (lower is often better)\n`;
    report += `3. **Run Optimization**: Use \`optimize_black_litterman\` with your views\n`;
    report += `4. **Analyze Results**: Compare BL portfolio to market weights\n`;
    report += `5. **Iterate**: Refine views based on results and market changes\n`;

    report += `\n*Guide completed at: ${new Date().toLocaleString()}*`;

    return {
      content: [{ type: "text", text: report }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error creating view builder: ${error.message}`
      }]
    };
  }
}