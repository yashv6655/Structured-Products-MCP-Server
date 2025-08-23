import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class AlphaVantageClient {
  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.baseUrl = process.env.ALPHA_VANTAGE_BASE_URL || 'https://www.alphavantage.co/query';
    this.rateLimitCalls = parseInt(process.env.ALPHA_VANTAGE_RATE_LIMIT_CALLS) || 5;
    this.rateLimitWindow = parseInt(process.env.ALPHA_VANTAGE_RATE_LIMIT_WINDOW) || 60000; // 1 minute
    
    // Rate limiting tracking
    this.callHistory = [];
    
    if (!this.apiKey || this.apiKey === 'your_api_key_here') {
      console.warn('WARNING: Alpha Vantage API key not configured. Set ALPHA_VANTAGE_API_KEY in .env file');
    }
  }

  /**
   * Check if we're within rate limits
   */
  isWithinRateLimit() {
    const now = Date.now();
    // Remove calls older than the rate limit window
    this.callHistory = this.callHistory.filter(callTime => now - callTime < this.rateLimitWindow);
    
    return this.callHistory.length < this.rateLimitCalls;
  }

  /**
   * Wait until we can make another API call
   */
  async waitForRateLimit() {
    if (this.isWithinRateLimit()) return;
    
    const oldestCall = Math.min(...this.callHistory);
    const waitTime = this.rateLimitWindow - (Date.now() - oldestCall);
    
    console.error(`INFO: Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime + 1000)); // Add 1s buffer
  }

  /**
   * Make API request with rate limiting and retry logic
   */
  async makeRequest(params, maxRetries = 3) {
    if (!this.apiKey || this.apiKey === 'your_api_key_here') {
      throw new Error('Alpha Vantage API key not configured. Please set ALPHA_VANTAGE_API_KEY in .env file');
    }

    await this.waitForRateLimit();
    
    // Add API key to parameters
    const requestParams = new URLSearchParams({
      ...params,
      apikey: this.apiKey
    });

    const url = `${this.baseUrl}?${requestParams}`;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.error(`INFO: Alpha Vantage API call (${params.function}): Attempt ${attempt}`);
        
        this.callHistory.push(Date.now());
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Check for Alpha Vantage API errors
        if (data['Error Message']) {
          throw new Error(`Alpha Vantage Error: ${data['Error Message']}`);
        }
        
        if (data['Note'] && data['Note'].includes('API call frequency')) {
          console.error('WARNING: Alpha Vantage rate limit message received');
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          continue; // Retry
        }
        
        if (data['Information'] && data['Information'].includes('Thank you')) {
          console.error('SUCCESS: Alpha Vantage response received');
        }
        
        return data;
        
      } catch (error) {
        console.error(`ERROR: Attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.error(`⏳ Retrying in ${backoffTime / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  /**
   * Get real-time stock quote
   */
  async getQuote(symbol) {
    return await this.makeRequest({
      function: 'GLOBAL_QUOTE',
      symbol: symbol
    });
  }

  /**
   * Get daily time series data
   */
  async getDailyTimeSeries(symbol, outputsize = 'compact') {
    return await this.makeRequest({
      function: 'TIME_SERIES_DAILY',
      symbol: symbol,
      outputsize: outputsize // 'compact' (100 days) or 'full' (20+ years)
    });
  }

  /**
   * Get company overview/fundamentals
   */
  async getCompanyOverview(symbol) {
    return await this.makeRequest({
      function: 'OVERVIEW',
      symbol: symbol
    });
  }

  /**
   * Get Treasury yield (risk-free rate)
   */
  async getTreasuryYield(interval = 'monthly', maturity = '10year') {
    return await this.makeRequest({
      function: 'TREASURY_YIELD',
      interval: interval,
      maturity: maturity
    });
  }

  /**
   * Get Federal Funds Rate
   */
  async getFederalFundsRate(interval = 'monthly') {
    return await this.makeRequest({
      function: 'FEDERAL_FUNDS_RATE',
      interval: interval
    });
  }

  /**
   * Get inflation rate
   */
  async getInflationRate() {
    return await this.makeRequest({
      function: 'INFLATION'
    });
  }

  /**
   * Get Real GDP
   */
  async getRealGDP(interval = 'quarterly') {
    return await this.makeRequest({
      function: 'REAL_GDP',
      interval: interval
    });
  }

  /**
   * Get technical indicator - RSI
   */
  async getRSI(symbol, interval = 'daily', timePeriod = 14, seriesType = 'close') {
    return await this.makeRequest({
      function: 'RSI',
      symbol: symbol,
      interval: interval,
      time_period: timePeriod,
      series_type: seriesType
    });
  }

  /**
   * Get technical indicator - Simple Moving Average
   */
  async getSMA(symbol, interval = 'daily', timePeriod = 20, seriesType = 'close') {
    return await this.makeRequest({
      function: 'SMA',
      symbol: symbol,
      interval: interval,
      time_period: timePeriod,
      series_type: seriesType
    });
  }

  /**
   * Get technical indicator - Bollinger Bands
   */
  async getBollingerBands(symbol, interval = 'daily', timePeriod = 20, seriesType = 'close') {
    return await this.makeRequest({
      function: 'BBANDS',
      symbol: symbol,
      interval: interval,
      time_period: timePeriod,
      series_type: seriesType
    });
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      console.error('INFO: Testing Alpha Vantage API connection...');
      const response = await this.getQuote('AAPL');
      
      if (response && response['Global Quote']) {
        console.error('SUCCESS: Alpha Vantage API connection successful');
        const quote = response['Global Quote'];
        const price = parseFloat(quote['05. price']);
        const changePercent = quote['10. change percent'];
        console.error(`INFO: AAPL: $${price.toFixed(2)} (${changePercent})`);
        return true;
      } else {
        console.error('ERROR: Unexpected API response format');
        return false;
      }
    } catch (error) {
      console.error('ERROR: Alpha Vantage API connection failed:', error.message);
      return false;
    }
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    const now = Date.now();
    const recentCalls = this.callHistory.filter(callTime => now - callTime < this.rateLimitWindow);
    
    return {
      callsInWindow: recentCalls.length,
      maxCalls: this.rateLimitCalls,
      windowMs: this.rateLimitWindow,
      canMakeCall: this.isWithinRateLimit(),
      timeToReset: recentCalls.length > 0 ? 
        Math.max(0, this.rateLimitWindow - (now - Math.min(...recentCalls))) : 0
    };
  }
}

// Export singleton instance
export default new AlphaVantageClient();