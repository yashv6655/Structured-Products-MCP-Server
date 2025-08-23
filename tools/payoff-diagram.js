import { calculatePayoff, blackScholes } from './financial-math.js';
import marketData from '../services/market-data.js';
import MarketCalculations from '../utils/market-calculations.js';

export async function generatePayoffDiagram(args) {
  try {
    const {
      product_type,
      underlying_price,
      strike_price,
      barrier_price,
      time_to_expiry = 1,
      price_range,
      symbol, // NEW: Stock symbol for real market data
      use_market_data = false, // NEW: Flag to use real market data
      risk_free_rate, // NEW: Custom risk-free rate (will fetch if not provided)
      volatility // NEW: Custom volatility (will calculate if not provided)
    } = args;

    let currentPrice = underlying_price;
    let marketVolatility = volatility;
    let riskFreeRate = risk_free_rate || 0.05; // Default fallback
    let marketContext = null;
    
    // Fetch real market data if requested
    if (use_market_data && symbol) {
      console.error(`INFO: Fetching real market data for ${symbol}...`);
      
      try {
        // Get current price
        const priceData = await marketData.getCurrentPrice(symbol);
        currentPrice = priceData.price;
        
        console.error(`INFO: Current ${symbol} price: $${currentPrice.toFixed(2)}`);
        
        // Get historical data for volatility calculation
        if (!marketVolatility) {
          console.error(`INFO: Calculating historical volatility for ${symbol}...`);
          const historicalData = await marketData.getHistoricalPrices(symbol, 'compact');
          const volData = MarketCalculations.calculateHistoricalVolatility(historicalData, 30);
          marketVolatility = volData.annualizedVolatility;
          
          console.error(`INFO: 30-day historical volatility: ${(marketVolatility * 100).toFixed(1)}%`);
        }
        
        // Get risk-free rate if not provided
        if (!risk_free_rate) {
          const treasuryData = await marketData.getRiskFreeRate('10year');
          riskFreeRate = treasuryData.rate;
          
          console.error(`INFO: Current 10-year Treasury rate: ${(riskFreeRate * 100).toFixed(2)}%`);
        }
        
        // Store market context for summary
        marketContext = {
          symbol: symbol,
          currentPrice: currentPrice,
          marketVolatility: marketVolatility,
          riskFreeRate: riskFreeRate,
          dataTimestamp: priceData.timestamp
        };
        
      } catch (error) {
        console.warn(`WARNING: Could not fetch market data for ${symbol}: ${error.message}`);
        console.error(`INFO: Using provided parameters as fallback`);
      }
    }
    
    // Use fetched current price or fallback to provided price
    const finalUnderlyingPrice = currentPrice || underlying_price;

    // Generate price points (use final underlying price for range)
    const actualPriceRange = price_range || {
      min: finalUnderlyingPrice * 0.5,
      max: finalUnderlyingPrice * 1.5,
      steps: 50
    };
    
    const minPrice = actualPriceRange.min || finalUnderlyingPrice * 0.5;
    const maxPrice = actualPriceRange.max || finalUnderlyingPrice * 1.5;
    const steps = actualPriceRange.steps || 50;
    
    const priceStep = (maxPrice - minPrice) / steps;
    const prices = [];
    const payoffs = [];
    const premiums = [];
    
    // Calculate payoffs and option premiums for each price point
    for (let i = 0; i <= steps; i++) {
      const price = minPrice + i * priceStep;
      prices.push(price);
      
      // Calculate intrinsic payoff
      const payoff = calculatePayoff(product_type, price, strike_price, barrier_price, {
        coupon: 0.1, // 10% coupon for autocallables
        underlyings: [price],
        strikes: [strike_price]
      });
      payoffs.push(payoff);
      
      // Calculate option premium using Black-Scholes with real market data
      if (['call', 'put'].includes(product_type) && time_to_expiry > 0) {
        const usedVolatility = marketVolatility || 0.25; // Use calculated or fallback volatility
        const premium = blackScholes(price, strike_price, time_to_expiry, riskFreeRate, usedVolatility, product_type);
        premiums.push(premium);
      } else {
        premiums.push(0);
      }
    }
    
    // Generate ASCII chart
    const chart = generateASCIIChart(prices, payoffs, {
      title: `${product_type.toUpperCase()} Payoff Diagram`,
      xLabel: 'Underlying Price',
      yLabel: 'Payoff',
      width: 60,
      height: 20
    });
    
    // Calculate key metrics using final underlying price
    const currentPayoff = calculatePayoff(product_type, finalUnderlyingPrice, strike_price, barrier_price, {
      coupon: 0.1,
      underlyings: [finalUnderlyingPrice],
      strikes: [strike_price]
    });
    
    const breakeven = findBreakeven(prices, payoffs);
    const maxPayoff = Math.max(...payoffs);
    const maxLoss = Math.min(...payoffs);
    
    // Create enhanced summary with market data
    const summary = createPayoffSummary(product_type, {
      underlying_price: finalUnderlyingPrice,
      strike_price,
      barrier_price,
      current_payoff: currentPayoff,
      breakeven,
      max_payoff: maxPayoff,
      max_loss: maxLoss,
      time_to_expiry,
      market_context: marketContext,
      volatility: marketVolatility,
      risk_free_rate: riskFreeRate
    });
    
    return {
      content: [
        {
          type: "text",
          text: `# ${product_type.toUpperCase()} Payoff Analysis\n\n${chart}\n\n${summary}\n\n## Raw Data\n\`\`\`json\n${JSON.stringify({
            prices: prices.map(p => Math.round(p * 100) / 100),
            payoffs: payoffs.map(p => Math.round(p * 10000) / 10000),
            parameters: {
              product_type,
              underlying_price: finalUnderlyingPrice,
              strike_price,
              barrier_price,
              time_to_expiry,
              market_data_used: use_market_data && symbol ? true : false,
              symbol: symbol || null,
              volatility: marketVolatility,
              risk_free_rate: riskFreeRate
            }
          }, null, 2)}\n\`\`\``
        }
      ]
    };
    
  } catch (error) {
    return {
      content: [
        {
          type: "text", 
          text: `Error generating payoff diagram: ${error.message}`
        }
      ]
    };
  }
}

function generateASCIIChart(xData, yData, options = {}) {
  const { title = 'Chart', xLabel = 'X', yLabel = 'Y', width = 60, height = 20 } = options;
  
  const minX = Math.min(...xData);
  const maxX = Math.max(...xData);
  const minY = Math.min(...yData);
  const maxY = Math.max(...yData);
  
  // Create grid
  const grid = Array(height).fill().map(() => Array(width).fill(' '));
  
  // Plot data points
  for (let i = 0; i < xData.length; i++) {
    const x = Math.floor(((xData[i] - minX) / (maxX - minX)) * (width - 1));
    const y = Math.floor(((yData[i] - minY) / (maxY - minY)) * (height - 1));
    
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[height - 1 - y][x] = '*';
    }
  }
  
  // Add axes
  const zeroY = Math.floor(((0 - minY) / (maxY - minY)) * (height - 1));
  if (zeroY >= 0 && zeroY < height) {
    for (let x = 0; x < width; x++) {
      if (grid[height - 1 - zeroY][x] === ' ') {
        grid[height - 1 - zeroY][x] = '-';
      }
    }
  }
  
  // Convert grid to string
  let chart = `${title}\n`;
  chart += `${yLabel} |\n`;
  
  for (let y = 0; y < height; y++) {
    const value = minY + ((height - 1 - y) / (height - 1)) * (maxY - minY);
    const label = value.toFixed(2).padStart(6);
    chart += `${label} |${grid[y].join('')}|\n`;
  }
  
  chart += `       ${'+'.padEnd(width, '-')}+\n`;
  chart += `        ${minX.toFixed(0).padEnd(Math.floor(width/2))}${maxX.toFixed(0).padStart(Math.floor(width/2))}\n`;
  chart += `        ${xLabel}\n`;
  
  return chart;
}

function findBreakeven(prices, payoffs) {
  // For vanilla options, breakeven is where payoff equals premium
  // For structured products, it's more complex
  for (let i = 0; i < prices.length - 1; i++) {
    if (payoffs[i] <= 0 && payoffs[i + 1] > 0) {
      // Linear interpolation to find more precise breakeven
      const ratio = -payoffs[i] / (payoffs[i + 1] - payoffs[i]);
      return prices[i] + ratio * (prices[i + 1] - prices[i]);
    }
  }
  return null;
}

function createPayoffSummary(productType, metrics) {
  const {
    underlying_price,
    strike_price,
    barrier_price,
    current_payoff,
    breakeven,
    max_payoff,
    max_loss,
    time_to_expiry,
    market_context,
    volatility,
    risk_free_rate
  } = metrics;
  
  let summary = `## Key Metrics\n\n`;
  summary += `- **Product Type**: ${productType.toUpperCase()}\n`;
  summary += `- **Current Underlying Price**: $${underlying_price.toFixed(2)}\n`;
  summary += `- **Strike Price**: $${strike_price.toFixed(2)}\n`;
  
  if (barrier_price) {
    summary += `- **Barrier Level**: $${barrier_price.toFixed(2)}\n`;
  }
  
  summary += `- **Time to Expiry**: ${time_to_expiry} years\n`;
  summary += `- **Current Payoff**: $${current_payoff.toFixed(4)}\n`;
  
  if (breakeven) {
    summary += `- **Breakeven Price**: $${breakeven.toFixed(2)}\n`;
  }
  
  summary += `- **Maximum Payoff**: $${max_payoff.toFixed(4)}\n`;
  summary += `- **Maximum Loss**: $${Math.abs(max_loss).toFixed(4)}\n`;
  
  // Add market data context if available
  if (market_context) {
    summary += `\n## Market Data Context\n`;
    summary += `- **Symbol**: ${market_context.symbol}\n`;
    summary += `- **Real-time Price**: $${market_context.currentPrice.toFixed(2)}\n`;
    summary += `- **Historical Volatility**: ${(market_context.marketVolatility * 100).toFixed(1)}%\n`;
    summary += `- **Risk-Free Rate**: ${(market_context.riskFreeRate * 100).toFixed(2)}%\n`;
    summary += `- **Data as of**: ${new Date(market_context.dataTimestamp).toLocaleString()}\n`;
  } else if (volatility || risk_free_rate) {
    summary += `\n## Model Parameters\n`;
    if (volatility) summary += `- **Volatility**: ${(volatility * 100).toFixed(1)}%\n`;
    if (risk_free_rate) summary += `- **Risk-Free Rate**: ${(risk_free_rate * 100).toFixed(2)}%\n`;
  }
  
  summary += `\n`;
  
  // Add product-specific insights
  switch (productType) {
    case 'call':
      summary += `## Call Option Insights\n`;
      summary += `- **Moneyness**: ${underlying_price > strike_price ? 'In-the-money' : underlying_price === strike_price ? 'At-the-money' : 'Out-of-the-money'}\n`;
      summary += `- **Profit if above**: $${strike_price.toFixed(2)}\n`;
      break;
      
    case 'put':
      summary += `## Put Option Insights\n`;
      summary += `- **Moneyness**: ${underlying_price < strike_price ? 'In-the-money' : underlying_price === strike_price ? 'At-the-money' : 'Out-of-the-money'}\n`;
      summary += `- **Profit if below**: $${strike_price.toFixed(2)}\n`;
      break;
      
    case 'autocallable':
      summary += `## Autocallable Note Insights\n`;
      summary += `- **Barrier Protection**: ${barrier_price ? `Protected above $${barrier_price.toFixed(2)}` : 'No barrier protection'}\n`;
      summary += `- **Coupon Trigger**: Pays coupon if above barrier at expiry\n`;
      summary += `- **Downside Participation**: Below strike, participates in underlying performance\n`;
      break;
      
    case 'barrier_option':
      summary += `## Barrier Option Insights\n`;
      summary += `- **Barrier Level**: $${barrier_price.toFixed(2)}\n`;
      summary += `- **Knockout Risk**: Option becomes worthless if barrier is breached\n`;
      summary += `- **Enhanced Return**: Higher potential return due to barrier risk\n`;
      break;
  }
  
  return summary;
}