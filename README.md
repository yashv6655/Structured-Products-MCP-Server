# Financial Structured Products MCP Server

A comprehensive MCP server for analyzing financial structured products, portfolio optimization, and advanced risk analytics, designed for Claude Desktop integration.

## Development Commands

- **Install dependencies**: `npm install`
- **Start server**: `npm start` or `node server.js`
- **Development mode**: `npm run dev` (with auto-restart on changes)
- **Run tests**: `npm test` (executes comprehensive test suite)
- **Individual test files**: 
  - `node test-alpha-vantage.js` (market data API tests)
  - `node test-cache.js` (cache performance tests)  
  - `node test-phase2.js` (phase 2 tools tests)

## Architecture

### Core Components

- **server.js**: Main MCP server with 20+ financial analysis tools
- **tools/**: Tool implementations organized by functionality
  - Financial math core (`financial-math.js`, `monte-carlo.js`)
  - Portfolio optimization (`portfolio-optimizer.js`, `black-litterman-optimizer.js`, `risk-parity-optimizer.js`)
  - Risk analysis (`advanced-risk-analyzer.js`, `scenario-analysis.js`)
  - Backtesting (`backtesting-tools.js`)
- **utils/**: Shared utilities and data processing
  - Market data (`alpha-vantage-client.js`, `market-calculations.js`)
  - Caching (`data-cache.js` - in-memory cache with TTL)
  - Analysis engines (`backtesting-engine.js`, `technical-analysis.js`)
- **services/**: High-level service layer (`market-data.js`)

### Data Flow

1. **Market Data**: Real-time data from Alpha Vantage API with intelligent caching (5min-24hr TTL)
2. **Processing**: Financial calculations using mathjs, ml-matrix, and custom algorithms
3. **Caching**: Multi-tier caching (market data 5min, volatility 1hr, rates 24hr)
4. **Output**: Structured markdown with ASCII visualizations

### Key Technologies

- **MCP SDK**: @modelcontextprotocol/sdk v1.0.0 for Claude integration
- **Financial Math**: mathjs, ml-matrix, simple-statistics, regression
- **Market Data**: Alpha Vantage API with node-fetch
- **Caching**: Custom in-memory cache with LRU eviction and TTL

## Tool Categories

### Core Structured Products
- `generate_payoff_diagram`: Payoff analysis for options, autocallables, barriers
- `run_monte_carlo_simulation`: Monte Carlo for exotic derivatives
- `stress_test_scenarios`: Multi-scenario stress testing
- `optimize_structure`: Parameter optimization for structured products

### Portfolio Optimization  
- `build_portfolio`: Modern portfolio theory optimization
- `optimize_black_litterman`: Black-Litterman with investor views
- `optimize_risk_parity`: Equal risk contribution optimization
- `compare_risk_parity_methods`: Method comparison analysis

### Risk Analytics
- `analyze_advanced_risk`: Comprehensive risk metrics (Sortino, Treynor, VaR)
- `analyze_risk_attribution`: Factor-based risk decomposition
- `analyze_stock`: Technical and fundamental analysis

### Backtesting & Validation
- `run_backtesting_analysis`: Historical strategy testing
- `run_walk_forward_test`: Walk-forward optimization
- `run_strategy_comparison`: Multi-strategy comparison
- `run_monte_carlo_robustness_test`: Robustness validation

### System Tools
- `cache_status`: Cache performance metrics
- `test_cache`: Cache timing analysis

## Setup & Configuration

### Environment Variables

Required for full functionality:
```bash
# Alpha Vantage API (for real market data)
ALPHA_VANTAGE_API_KEY=your_api_key_here
ALPHA_VANTAGE_BASE_URL=https://www.alphavantage.co/query

# Cache Configuration (optional - defaults provided)
CACHE_MAX_ENTRIES=1000
CACHE_DEFAULT_TTL=300000              # 5 minutes
MARKET_DATA_CACHE_TTL=300000          # 5 minutes  
VOLATILITY_CACHE_TTL=3600000          # 1 hour
TREASURY_RATE_CACHE_TTL=86400000      # 24 hours

# Rate Limiting (optional)
ALPHA_VANTAGE_RATE_LIMIT_CALLS=5
ALPHA_VANTAGE_RATE_LIMIT_WINDOW=60000 # 1 minute
```

### Installation

1. Install dependencies: `npm install`
2. Configure environment: Copy `.env.example` to `.env` (if available)
3. Test setup: `npm test`

## Claude Code Integration

Add this server to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "financial-structured-products": {
      "command": "node",
      "args": ["/path/to/your/server.js"]
    }
  }
}
```

Replace `/path/to/your/server.js` with the actual path to this project's server.js file.

## Common Usage Patterns

### With Market Data Integration
```
"Analyze AAPL with technical indicators and build an optimal portfolio with MSFT and GOOGL"
"Stress test a barrier option on TSLA using real market volatility"
"Compare risk parity vs mean variance for tech stocks: AAPL, MSFT, GOOGL, AMZN"
```

### Structured Products Analysis  
```
"Generate payoff diagram for autocallable on SPY with 15% coupon and 70% barrier"
"Run Monte Carlo simulation for Asian option with 6-month lookback period"
"Optimize barrier option structure targeting 12% annual return with 0.6 risk tolerance"
```

### Portfolio & Risk Analytics
```
"Build Black-Litterman portfolio with bullish view on AAPL vs MSFT"
"Run walk-forward test on risk parity strategy for diversified portfolio" 
"Analyze advanced risk metrics for equal-weight portfolio of dividend stocks"
```

## Mathematical Models & Algorithms

### Core Financial Mathematics (`tools/financial-math.js`)

**Black-Scholes Option Pricing Model**
- **Formula**: C = S₀N(d₁) - Ke^(-rT)N(d₂) for calls
- **Parameters**: S₀ (spot price), K (strike), T (time to expiry), r (risk-free rate), σ (volatility)
- **Implementation**: `blackScholes(S, K, T, r, sigma, optionType)`
- **Greeks Calculation**: Full sensitivity analysis with finite difference methods
  - Delta: ∂V/∂S (price sensitivity)
  - Gamma: ∂²V/∂S² (delta sensitivity)  
  - Vega: ∂V/∂σ (volatility sensitivity)
  - Theta: ∂V/∂T (time decay)
  - Rho: ∂V/∂r (interest rate sensitivity)

**Geometric Brownian Motion (GBM)**
- **Model**: dS = μSdt + σSdW (stochastic differential equation)
- **Discretization**: S_{t+Δt} = S_t * exp((r - σ²/2)Δt + σ√Δt * ε)
- **Implementation**: `simulateGBM(S0, r, sigma, T, steps)`
- **Applications**: Monte Carlo path generation, exotic option pricing

**Statistical Distributions**
- **Normal CDF/PDF**: Error function approximation with Abramowitz-Stegun algorithm
- **Box-Muller Transform**: `randomNormal()` for Gaussian random number generation
- **Implementation**: Custom functions for numerical accuracy

### Monte Carlo Methods (`tools/monte-carlo.js`)

**Advanced Monte Carlo Simulation**
- **Path Generation**: Multi-step GBM simulation with configurable time steps
- **Payoff Structures**: Support for exotic derivatives (Asian, Barrier, Autocallable, Lookback)
- **Variance Reduction**: Antithetic variates and control variates (planned)
- **Greek Estimation**: Finite difference method with optimal bump sizes

**Specialized Product Pricing**
- **Autocallable Notes**: Early redemption with barrier observation
- **Barrier Options**: Down-and-out/in with continuous monitoring
- **Asian Options**: Arithmetic average price options
- **Rainbow Options**: Multi-asset best-of/worst-of structures

**Risk Assessment Integration**
- **Value at Risk (VaR)**: Historical and parametric methods at 95%/99% confidence
- **Expected Shortfall**: Conditional VaR calculation
- **Maximum Drawdown**: Peak-to-trough analysis
- **Barrier Breach Analysis**: Knock-out probability estimation

### Portfolio Optimization (`utils/portfolio-math.js`)

**Modern Portfolio Theory (Markowitz)**
- **Mean-Variance Optimization**: min w'Σw subject to w'μ = μₚ, w'1 = 1
- **Efficient Frontier**: Parametric optimization across return-risk spectrum
- **Maximum Sharpe Ratio**: Tangency portfolio calculation
- **Implementation**: Matrix operations with ml-matrix library

**Black-Litterman Model** 
- **Equilibrium Returns**: π = λΣw_market (CAPM-based implied returns)
- **Bayesian Update**: μ_BL = [(τΣ)⁻¹ + P'Ω⁻¹P]⁻¹[(τΣ)⁻¹π + P'Ω⁻¹Q]
- **View Matrix**: P (picking matrix), Q (view returns), Ω (view uncertainty)
- **Parameters**: τ (prior uncertainty), λ (risk aversion coefficient)

**Risk Parity Optimization**
- **Equal Risk Contribution**: Target RC_i = 1/n for all assets
- **Risk Contribution**: RC_i = w_i * (Σw)_i / (w'Σw)
- **Optimization Method**: Spinu (2013) iterative rebalancing algorithm
- **Constrained Version**: Weight bounds with projection methods
- **Hierarchical Approach**: Correlation-based clustering with inverse variance allocation

### Advanced Risk Analytics (`tools/advanced-risk-analyzer.js`)

**Downside Risk Measures**
- **Sortino Ratio**: (r_p - r_f) / DD where DD = √E[min(r_t - τ, 0)²]
- **Downside Deviation**: Semi-standard deviation below target return
- **Upside Potential Ratio**: Upside potential / downside deviation
- **Semi-variance**: Variance of negative returns only

**Drawdown Analysis**
- **Maximum Drawdown**: max_t[(peak_t - trough_t) / peak_t]
- **Calmar Ratio**: Annual return / maximum drawdown
- **Recovery Period**: Time from peak to recovery
- **Peak-to-trough Detection**: Rolling maximum analysis

**Value at Risk Models**
- **Historical VaR**: Empirical quantile method
- **Parametric VaR**: Assumes normal distribution with z-score multiplier
- **Expected Shortfall**: E[r | r ≤ VaR] (coherent risk measure)
- **Confidence Levels**: 95% and 99% standard implementations

**Beta and Systematic Risk**
- **Portfolio Beta**: β_p = Cov(r_p, r_m) / Var(r_m)
- **Treynor Ratio**: (r_p - r_f) / β_p (systematic risk-adjusted return)
- **Information Ratio**: α_p / TE where TE is tracking error
- **Tracking Error**: √Var(r_p - r_b) (active risk)

### Technical Analysis (`utils/technical-analysis.js`)

**Moving Average Systems**
- **Simple Moving Average (SMA)**: SMA_n = Σp_i / n
- **Exponential Moving Average (EMA)**: EMA_t = α*p_t + (1-α)*EMA_{t-1}
- **Bollinger Bands**: SMA ± k*σ where σ is rolling standard deviation
- **MACD**: EMA_12 - EMA_26 with signal line EMA_9

**Momentum Indicators**
- **Relative Strength Index (RSI)**: RSI = 100 - 100/(1 + RS) where RS = avg_gain/avg_loss
- **Stochastic Oscillator**: %K = (C - L14)/(H14 - L14) * 100
- **Rate of Change (ROC)**: (P_t - P_{t-n})/P_{t-n} * 100

**Volatility Measures**
- **Historical Volatility**: σ = √(252 * Var(log returns)) (annualized)
- **Parkinson Estimator**: Uses high-low-open-close data for efficiency
- **Rolling Volatility**: Time-varying estimates with configurable windows

### Backtesting Engine (`utils/backtesting-engine.js`)

**Strategy Testing Framework**
- **Walk-Forward Analysis**: Rolling optimization and out-of-sample testing  
- **Monte Carlo Robustness**: Parameter sensitivity via bootstrap sampling
- **Multi-Strategy Comparison**: Risk-adjusted performance metrics
- **Transaction Cost Integration**: Bid-ask spreads and impact costs

**Performance Attribution**
- **Factor Decomposition**: Systematic vs. specific returns
- **Style Analysis**: Sharpe (1992) returns-based attribution
- **Risk Attribution**: Contribution to portfolio variance by factor
- **Active Share**: Σ|w_p - w_b|/2 (portfolio vs. benchmark differences)

## Key Implementation Notes

### Numerical Methods
- **Matrix Operations**: ml-matrix library for linear algebra
- **Optimization**: Custom gradient-free methods for portfolio optimization
- **Root Finding**: Newton-Raphson and bisection methods for implied volatility
- **Integration**: Trapezoidal rule for numerical integration

### Market Data Integration
- **Real-time quotes**: Alpha Vantage API integration with rate limiting
- **Historical data**: Automatic volatility calculation from price history
- **Caching strategy**: Multi-tier TTL caching (quotes 5min, volatility 1hr, rates 24hr)
- **Fallback**: Graceful degradation when API unavailable

### Performance Considerations
- **Caching**: LRU eviction with configurable TTL per data type
- **Rate limiting**: Intelligent API call management (5 calls/minute default)
- **Memory usage**: Bounded cache with configurable max entries (1000 default)
- **Async processing**: Non-blocking financial calculations

## Testing & Debugging

### Test Suite Organization
- **test.js**: Core functionality tests (payoff diagrams, Monte Carlo, optimization)
- **test-alpha-vantage.js**: Market data API connectivity and rate limiting
- **test-cache.js**: Cache performance benchmarking and timing analysis
- **test-phase2.js**: Advanced tools (portfolio optimization, risk analytics)

### Common Debugging Steps
1. **API Issues**: Check `ALPHA_VANTAGE_API_KEY` configuration and rate limits
2. **Cache Problems**: Use `cache_status` tool to monitor hit/miss ratios
3. **Performance**: Run `test_cache` to benchmark API vs cached response times
4. **Calculations**: Verify financial math with known option values in test.js

### Environment Setup
- Requires Node.js 18+ (specified in package.json engines)
- Works with or without Alpha Vantage API (degrades gracefully)
- All dependencies are production-ready packages (mathjs, ml-matrix, etc.)

## Disclaimer

This tool is for educational and analysis purposes only. Not intended for actual trading or investment decisions. Always consult with qualified financial professionals for investment advice.
