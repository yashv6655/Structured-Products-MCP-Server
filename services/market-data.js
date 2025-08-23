import alphaVantageClient from '../utils/alpha-vantage-client.js';
import dataCache from '../utils/data-cache.js';
import dotenv from 'dotenv';

dotenv.config();

class MarketDataService {
  constructor() {
    // Cache TTL settings from environment
    this.marketDataCacheTTL = parseInt(process.env.MARKET_DATA_CACHE_TTL) || 300000; // 5 minutes
    this.volatilityCacheTTL = parseInt(process.env.VOLATILITY_CACHE_TTL) || 3600000; // 1 hour
    this.treasuryRateCacheTTL = parseInt(process.env.TREASURY_RATE_CACHE_TTL) || 86400000; // 24 hours
  }

  /**
   * Get current stock price
   */
  async getCurrentPrice(symbol) {
    const cacheKey = `market:${symbol}:quote`;
    
    // Check cache first
    const cached = dataCache.get(cacheKey);
    if (cached) {
      // Using cached price data
      return cached;
    }

    try {
      // Fetching current price from API
      const response = await alphaVantageClient.getQuote(symbol);
      
      if (!response || !response['Global Quote']) {
        throw new Error(`No quote data available for ${symbol}`);
      }

      const quote = response['Global Quote'];
      const priceData = {
        symbol: symbol,
        price: parseFloat(quote['05. price']),
        change: parseFloat(quote['09. change']),
        changePercent: quote['10. change percent'],
        volume: parseInt(quote['06. volume']),
        previousClose: parseFloat(quote['08. previous close']),
        open: parseFloat(quote['02. open']),
        high: parseFloat(quote['03. high']),
        low: parseFloat(quote['04. low']),
        latestTradingDay: quote['07. latest trading day'],
        timestamp: new Date().toISOString()
      };

      // Cache the result
      dataCache.set(cacheKey, priceData, this.marketDataCacheTTL);
      
      // Price data retrieved successfully
      return priceData;

    } catch (error) {
      console.error(`ERROR: Error fetching price for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get historical daily prices
   */
  async getHistoricalPrices(symbol, outputsize = 'compact') {
    const cacheKey = `market:${symbol}:daily:${outputsize}`;
    
    // Check cache first
    const cached = dataCache.get(cacheKey);
    if (cached) {
      // Using cached historical data
      return cached;
    }

    try {
      // Fetching historical prices from API
      const response = await alphaVantageClient.getDailyTimeSeries(symbol, outputsize);
      
      if (!response || !response['Time Series (Daily)']) {
        throw new Error(`No historical data available for ${symbol}`);
      }

      const timeSeries = response['Time Series (Daily)'];
      const metadata = response['Meta Data'];
      
      const historicalData = {
        symbol: symbol,
        lastRefreshed: metadata['3. Last Refreshed'],
        outputSize: metadata['4. Output Size'],
        prices: {},
        dates: []
      };

      // Process price data
      for (const [date, dailyData] of Object.entries(timeSeries)) {
        historicalData.prices[date] = {
          open: parseFloat(dailyData['1. open']),
          high: parseFloat(dailyData['2. high']),
          low: parseFloat(dailyData['3. low']),
          close: parseFloat(dailyData['4. close']),
          volume: parseInt(dailyData['5. volume'])
        };
        historicalData.dates.push(date);
      }

      // Sort dates in descending order (most recent first)
      historicalData.dates.sort((a, b) => new Date(b) - new Date(a));

      // Cache the result (longer TTL for historical data)
      dataCache.set(cacheKey, historicalData, this.volatilityCacheTTL);
      
      // Historical data retrieved successfully
      return historicalData;

    } catch (error) {
      console.error(`ERROR: Error fetching historical data for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get company fundamentals
   */
  async getCompanyOverview(symbol) {
    const cacheKey = `market:${symbol}:overview`;
    
    // Check cache first
    const cached = dataCache.get(cacheKey);
    if (cached) {
      // Using cached company overview
      return cached;
    }

    try {
      // Fetching company overview from API
      const response = await alphaVantageClient.getCompanyOverview(symbol);
      
      if (!response || !response.Symbol) {
        throw new Error(`No company data available for ${symbol}`);
      }

      const overview = {
        symbol: response.Symbol,
        name: response.Name,
        sector: response.Sector,
        industry: response.Industry,
        marketCap: response.MarketCapitalization ? parseInt(response.MarketCapitalization) : null,
        peRatio: response.PERatio ? parseFloat(response.PERatio) : null,
        beta: response.Beta ? parseFloat(response.Beta) : null,
        dividendYield: response.DividendYield ? parseFloat(response.DividendYield) : 0,
        eps: response.EPS ? parseFloat(response.EPS) : null,
        bookValue: response.BookValue ? parseFloat(response.BookValue) : null,
        priceToBook: response.PriceToBookRatio ? parseFloat(response.PriceToBookRatio) : null,
        description: response.Description || '',
        timestamp: new Date().toISOString()
      };

      // Cache for 24 hours
      dataCache.set(cacheKey, overview, 86400000);
      
      // Company overview retrieved successfully
      return overview;

    } catch (error) {
      console.error(`ERROR: Error fetching company overview for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get current risk-free rate (Treasury yield)
   */
  async getRiskFreeRate(maturity = '10year') {
    const cacheKey = `market:TREASURY:yield:${maturity}`;
    
    // Check cache first
    const cached = dataCache.get(cacheKey);
    if (cached) {
      // Using cached Treasury rate
      return cached;
    }

    try {
      // Fetching Treasury yield from API
      const response = await alphaVantageClient.getTreasuryYield('monthly', maturity);
      
      if (!response || !response.data) {
        throw new Error(`No Treasury yield data available for ${maturity}`);
      }

      // Get the most recent rate
      const latestData = response.data[0];
      const rateData = {
        maturity: maturity,
        rate: parseFloat(latestData.value) / 100, // Convert percentage to decimal
        date: latestData.date,
        timestamp: new Date().toISOString()
      };

      // Cache for 24 hours (Treasury rates don't change frequently)
      dataCache.set(cacheKey, rateData, this.treasuryRateCacheTTL);
      
      // Treasury rate retrieved successfully
      return rateData;

    } catch (error) {
      console.error(`ERROR: Error fetching Treasury rate:`, error.message);
      // Return fallback rate if API fails
      // Using fallback risk-free rate
      return {
        maturity: maturity,
        rate: 0.05, // 5% fallback
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        fallback: true
      };
    }
  }

  /**
   * Get Federal Funds Rate
   */
  async getFederalFundsRate() {
    const cacheKey = `market:FED:funds_rate`;
    
    // Check cache first
    const cached = dataCache.get(cacheKey);
    if (cached) {
      // Using cached Fed Funds Rate
      return cached;
    }

    try {
      // Fetching Federal Funds Rate from API
      const response = await alphaVantageClient.getFederalFundsRate('monthly');
      
      if (!response || !response.data) {
        throw new Error('No Federal Funds Rate data available');
      }

      const latestData = response.data[0];
      const rateData = {
        rate: parseFloat(latestData.value) / 100,
        date: latestData.date,
        timestamp: new Date().toISOString()
      };

      // Cache for 24 hours
      dataCache.set(cacheKey, rateData, this.treasuryRateCacheTTL);
      
      // Federal Funds Rate retrieved successfully
      return rateData;

    } catch (error) {
      console.error(`ERROR: Error fetching Federal Funds Rate:`, error.message);
      // Return fallback rate
      return {
        rate: 0.05, // 5% fallback
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        fallback: true
      };
    }
  }

  /**
   * Batch fetch multiple symbols
   */
  async getCurrentPrices(symbols) {
    const results = {};
    const errors = {};
    
    // Batch fetching prices for multiple symbols
    
    // Process symbols in parallel but respect rate limits
    for (const symbol of symbols) {
      try {
        results[symbol] = await this.getCurrentPrice(symbol);
        // Small delay between calls to be respectful to API
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        errors[symbol] = error.message;
        console.error(`ERROR: Failed to fetch ${symbol}: ${error.message}`);
      }
    }
    
    return {
      success: results,
      errors: errors,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get market data summary for a symbol
   */
  async getMarketSummary(symbol) {
    try {
      // Generating market summary
      
      const [currentPrice, overview] = await Promise.all([
        this.getCurrentPrice(symbol),
        this.getCompanyOverview(symbol).catch(() => null) // Don't fail if overview unavailable
      ]);

      const summary = {
        symbol: symbol,
        currentPrice: currentPrice,
        overview: overview,
        timestamp: new Date().toISOString()
      };

      // Market summary generated successfully
      return summary;

    } catch (error) {
      console.error(`ERROR: Error generating market summary for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Health check for market data service
   */
  async healthCheck() {
    try {
      // Performing market data service health check
      
      // Test API connection
      const apiTest = await alphaVantageClient.testConnection();
      
      // Test cache
      const cacheStats = dataCache.getStats();
      
      // Clean up expired cache entries
      const cleanedEntries = dataCache.cleanup();
      
      const health = {
        apiConnection: apiTest,
        cache: {
          ...cacheStats,
          cleanedExpiredEntries: cleanedEntries
        },
        rateLimitStatus: alphaVantageClient.getRateLimitStatus(),
        timestamp: new Date().toISOString()
      };

      // Health check completed successfully
      return health;

    } catch (error) {
      console.error('ERROR: Health check failed:', error.message);
      return {
        apiConnection: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
export default new MarketDataService();