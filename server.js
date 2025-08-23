#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Import our financial tools
import { generatePayoffDiagram } from './tools/payoff-diagram.js';
import { runMonteCarloSimulation } from './tools/monte-carlo.js';
import { stressTestScenarios } from './tools/scenario-analysis.js';
import { optimizeStructure } from './tools/optimization.js';
import { getCacheStatus, testCache } from './tools/cache-monitor.js';
import { buildPortfolio, analyzeStock } from './tools/portfolio-optimizer.js';
import { analyzeAdvancedRisk, analyzeRiskAttribution } from './tools/advanced-risk-analyzer.js';
import { optimizeBlackLitterman, createBlackLittermanViews } from './tools/black-litterman-optimizer.js';
import { optimizeRiskParity, compareRiskParityMethods } from './tools/risk-parity-optimizer.js';
import { runBacktestingAnalysis, runWalkForwardTest, runStrategyComparison, runMonteCarloRobustnessTest } from './tools/backtesting-tools.js';

class FinancialStructuredProductsServer {
  constructor() {
    this.server = new Server(
      {
        name: "financial-structured-products-server",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_payoff_diagram",
            description: "Generate payoff diagrams for structured products like autocallables, barrier options, and custom structures",
            inputSchema: {
              type: "object",
              properties: {
                product_type: {
                  type: "string",
                  enum: ["call", "put", "autocallable", "barrier_option", "rainbow_option"],
                  description: "Type of structured product"
                },
                underlying_price: {
                  type: "number",
                  description: "Current underlying asset price"
                },
                strike_price: {
                  type: "number", 
                  description: "Strike price of the option/structure"
                },
                barrier_price: {
                  type: "number",
                  description: "Barrier level (for barrier options)"
                },
                time_to_expiry: {
                  type: "number",
                  description: "Time to expiry in years"
                },
                price_range: {
                  type: "object",
                  properties: {
                    min: { type: "number" },
                    max: { type: "number" },
                    steps: { type: "number", default: 50 }
                  },
                  description: "Price range for payoff calculation"
                },
                symbol: {
                  type: "string",
                  description: "Stock symbol for real market data (e.g., 'AAPL', 'TSLA')"
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real-time market data and calculated volatility",
                  default: false
                },
                volatility: {
                  type: "number",
                  description: "Annual volatility (e.g., 0.25 for 25%). If not provided and use_market_data=true, will be calculated from historical data"
                },
                risk_free_rate: {
                  type: "number",
                  description: "Risk-free interest rate (e.g., 0.05 for 5%). If not provided and use_market_data=true, will fetch current Treasury rate"
                }
              },
              required: ["product_type", "underlying_price", "strike_price"]
            }
          },
          {
            name: "run_monte_carlo_simulation",
            description: "Run Monte Carlo simulations for exotic payoffs and risk analysis",
            inputSchema: {
              type: "object", 
              properties: {
                product_type: {
                  type: "string",
                  enum: ["autocallable", "barrier_option", "asian_option", "lookback_option"],
                  description: "Type of exotic product"
                },
                underlying_price: {
                  type: "number",
                  description: "Initial underlying price"
                },
                strike_price: {
                  type: "number",
                  description: "Strike price"
                },
                volatility: {
                  type: "number",
                  description: "Annual volatility (e.g., 0.25 for 25%)"
                },
                risk_free_rate: {
                  type: "number", 
                  description: "Risk-free interest rate (e.g., 0.05 for 5%)"
                },
                time_to_expiry: {
                  type: "number",
                  description: "Time to expiry in years"
                },
                num_simulations: {
                  type: "number",
                  default: 10000,
                  description: "Number of Monte Carlo simulations"
                },
                barrier_level: {
                  type: "number",
                  description: "Barrier level for barrier options"
                }
              },
              required: ["product_type", "underlying_price", "strike_price", "volatility", "risk_free_rate", "time_to_expiry"]
            }
          },
          {
            name: "stress_test_scenarios",
            description: "Perform stress testing across different market conditions with real market data integration",
            inputSchema: {
              type: "object",
              properties: {
                product_type: {
                  type: "string", 
                  description: "Type of structured product"
                },
                underlying_price: {
                  type: "number",
                  description: "Current underlying price"
                },
                strike_price: {
                  type: "number",
                  description: "Strike price"
                },
                volatility: {
                  type: "number",
                  description: "Base volatility. If not provided and use_market_data=true, will be calculated from historical data"
                },
                risk_free_rate: {
                  type: "number",
                  description: "Risk-free rate. If not provided and use_market_data=true, will fetch current Treasury rate"
                },
                barrier_level: {
                  type: "number",
                  description: "Barrier level for barrier products"
                },
                symbol: {
                  type: "string",
                  description: "Stock symbol for real market data (e.g., 'AAPL', 'TSLA')"
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real-time market data and calculated volatility for base case",
                  default: false
                },
                scenarios: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      price_shock: { type: "number" },
                      vol_shock: { type: "number" },
                      rate_shock: { type: "number" }
                    }
                  },
                  description: "Custom stress scenarios. If not provided, will use historical market stress scenarios"
                },
                include_historical_scenarios: {
                  type: "boolean",
                  description: "Include historical market crisis scenarios (2008 Financial Crisis, 2020 COVID, Dot-com Bubble)",
                  default: true
                }
              },
              required: ["product_type", "underlying_price", "strike_price"]
            }
          },
          {
            name: "optimize_structure", 
            description: "Find optimal strikes and barriers for structured products with real market data integration",
            inputSchema: {
              type: "object",
              properties: {
                product_type: {
                  type: "string",
                  description: "Type of product to optimize"
                },
                underlying_price: {
                  type: "number", 
                  description: "Current underlying price"
                },
                volatility: {
                  type: "number",
                  description: "Expected volatility. If not provided and use_market_data=true, will be calculated from historical data"
                },
                target_return: {
                  type: "number",
                  description: "Target annualized return"
                },
                risk_tolerance: {
                  type: "number",
                  description: "Risk tolerance (0-1 scale)"
                },
                time_to_expiry: {
                  type: "number",
                  description: "Time to expiry in years"
                },
                risk_free_rate: {
                  type: "number",
                  description: "Risk-free rate. If not provided and use_market_data=true, will fetch current Treasury rate"
                },
                symbol: {
                  type: "string",
                  description: "Stock symbol for real market data (e.g., 'AAPL', 'TSLA')"
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real-time market data for optimization parameters",
                  default: false
                },
                dividend_yield: {
                  type: "number",
                  description: "Dividend yield. If not provided and use_market_data=true, will fetch from company data"
                },
                market_regime_aware: {
                  type: "boolean",
                  description: "Adjust optimization based on current market volatility regime",
                  default: false
                }
              },
              required: ["product_type", "target_return", "time_to_expiry"]
            }
          },
          {
            name: "cache_status",
            description: "Get comprehensive cache performance metrics and status",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: "test_cache",
            description: "Test cache performance with timing comparisons across multiple API calls",
            inputSchema: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Stock symbol to use for cache testing (default: AAPL)",
                  default: "AAPL"
                },
                test_cycles: {
                  type: "number",
                  description: "Number test cycles to run (default: 3)",
                  default: 3,
                  minimum: 1,
                  maximum: 10
                },
                clear_cache_first: {
                  type: "boolean",
                  description: "Clear cache before testing to measure from cold start (default: false)",
                  default: false
                }
              },
              additionalProperties: false
            }
          },
          {
            name: "build_portfolio",
            description: "Build and optimize multi-asset portfolios using modern portfolio theory with real market data",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols to include in portfolio (e.g., ['AAPL', 'MSFT', 'GOOGL'])",
                  default: ["AAPL", "MSFT", "GOOGL"]
                },
                target_return: {
                  type: "number",
                  description: "Target annual return (e.g., 0.12 for 12%)",
                  default: 0.12,
                  minimum: 0,
                  maximum: 1
                },
                risk_tolerance: {
                  type: "number",
                  description: "Risk tolerance on 0-1 scale (0=very conservative, 1=very aggressive)",
                  default: 0.6,
                  minimum: 0,
                  maximum: 1
                },
                optimization_method: {
                  type: "string",
                  enum: ["max_sharpe", "min_variance", "target_return"],
                  description: "Portfolio optimization method",
                  default: "max_sharpe"
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real-time market data for optimization",
                  default: true
                },
                time_horizon: {
                  type: "number",
                  description: "Analysis time horizon in trading days (default: 252 = 1 year)",
                  default: 252,
                  minimum: 30,
                  maximum: 1260
                },
                risk_free_rate: {
                  type: "number",
                  description: "Risk-free rate for Sharpe ratio calculation (if not provided, fetches Treasury rate)"
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "analyze_stock",
            description: "Comprehensive stock analysis with technical indicators, fundamentals, and investment signals",
            inputSchema: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Stock symbol to analyze (e.g., 'AAPL', 'TSLA')"
                },
                analysis_period: {
                  type: "number",
                  description: "Number of days for technical analysis (default: 90)",
                  default: 90,
                  minimum: 30,
                  maximum: 365
                },
                include_technical: {
                  type: "boolean",
                  description: "Include technical analysis (moving averages, RSI, MACD, Bollinger Bands)",
                  default: true
                },
                include_fundamentals: {
                  type: "boolean",
                  description: "Include fundamental analysis (P/E, market cap, financials)",
                  default: true
                },
                signal_strength: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  description: "Required signal strength for buy/sell recommendations",
                  default: "medium"
                }
              },
              required: ["symbol"]
            }
          },
          {
            name: "analyze_advanced_risk",
            description: "Advanced portfolio risk analysis with FinQuant-inspired metrics including Sortino ratio, Treynor ratio, downside deviation, and comprehensive risk decomposition",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for portfolio analysis (e.g., ['AAPL', 'MSFT', 'GOOGL'])",
                  default: ["AAPL", "MSFT", "GOOGL"]
                },
                weights: {
                  type: "array",
                  items: { type: "number" },
                  description: "Portfolio weights for each symbol (must sum to 1). If not provided, equal weights are used"
                },
                benchmark_symbol: {
                  type: "string",
                  description: "Benchmark symbol for relative performance analysis (e.g., 'SPY' for S&P 500)",
                  default: "SPY"
                },
                analysis_period: {
                  type: "number",
                  description: "Number of trading days for analysis (default: 252 = 1 year)",
                  default: 252,
                  minimum: 60,
                  maximum: 1260
                },
                risk_free_rate: {
                  type: "number",
                  description: "Risk-free rate for Sharpe/Sortino calculations. If not provided, fetches current Treasury rate"
                },
                confidence_levels: {
                  type: "array",
                  items: { type: "number" },
                  description: "Confidence levels for VaR calculation (e.g., [0.95, 0.99])",
                  default: [0.95, 0.99]
                },
                include_attribution: {
                  type: "boolean",
                  description: "Include risk attribution and factor analysis",
                  default: true
                },
                rolling_window: {
                  type: "number",
                  description: "Rolling window size for rolling risk analysis (default: 30 days)",
                  default: 30,
                  minimum: 5,
                  maximum: 120
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for analysis",
                  default: true
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "analyze_risk_attribution",
            description: "Portfolio risk attribution analysis - decompose portfolio risk by factors including market, sector, and specific risks with correlation analysis",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for attribution analysis (e.g., ['AAPL', 'MSFT', 'GOOGL'])",
                  default: ["AAPL", "MSFT", "GOOGL"]
                },
                weights: {
                  type: "array",
                  items: { type: "number" },
                  description: "Portfolio weights for each symbol (must sum to 1). If not provided, equal weights are used"
                },
                analysis_period: {
                  type: "number",
                  description: "Number of trading days for analysis (default: 252 = 1 year)",
                  default: 252,
                  minimum: 60,
                  maximum: 1260
                },
                attribution_factors: {
                  type: "array",
                  items: { type: "string" },
                  description: "Risk attribution factors to analyze",
                  default: ["market", "sector", "specific"]
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for attribution analysis",
                  default: true
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "optimize_black_litterman",
            description: "Black-Litterman portfolio optimization combining market equilibrium with investor views for more realistic and stable portfolio allocations",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for portfolio optimization (e.g., ['AAPL', 'MSFT', 'GOOGL'])",
                  default: ["AAPL", "MSFT", "GOOGL"]
                },
                views: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["absolute", "relative"],
                        description: "Type of view: 'absolute' for expected return, 'relative' for outperformance"
                      },
                      asset_index: {
                        type: "number",
                        description: "Index of asset for absolute views (0-based)"
                      },
                      asset1_index: {
                        type: "number",
                        description: "Index of first asset for relative views (0-based)"
                      },
                      asset2_index: {
                        type: "number",
                        description: "Index of second asset for relative views (0-based)"
                      },
                      return_expectation: {
                        type: "number",
                        description: "Expected return (e.g., 0.12 for 12%) or relative outperformance"
                      },
                      confidence: {
                        type: "number",
                        description: "Confidence in view (0.1-0.8, default: 0.25)",
                        minimum: 0.1,
                        maximum: 0.8,
                        default: 0.25
                      },
                      description: {
                        type: "string",
                        description: "Optional description of the investment view"
                      }
                    },
                    required: ["type", "return_expectation"]
                  },
                  description: "Array of investment views to incorporate"
                },
                view_confidence: {
                  type: "array",
                  items: { type: "number" },
                  description: "Confidence levels for each view (overrides individual view confidence)"
                },
                tau: {
                  type: "number",
                  description: "Prior uncertainty parameter (typically 0.01-0.1, default: 0.05)",
                  default: 0.05,
                  minimum: 0.001,
                  maximum: 0.5
                },
                risk_aversion: {
                  type: "number",
                  description: "Risk aversion parameter (typical range: 1-10, default: 3)",
                  default: 3.0,
                  minimum: 0.1,
                  maximum: 20
                },
                analysis_period: {
                  type: "number",
                  description: "Number of trading days for covariance estimation (default: 252 = 1 year)",
                  default: 252,
                  minimum: 60,
                  maximum: 1260
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for optimization",
                  default: true
                },
                auto_generate_views: {
                  type: "boolean",
                  description: "Automatically generate views from technical/fundamental analysis",
                  default: false
                },
                market_cap_source: {
                  type: "string",
                  enum: ["api", "equal", "custom"],
                  description: "Source for market capitalization weights",
                  default: "api"
                },
                custom_market_caps: {
                  type: "array",
                  items: { type: "number" },
                  description: "Custom market capitalizations when market_cap_source is 'custom'"
                },
                include_comparison: {
                  type: "boolean",
                  description: "Include comparison with market portfolio",
                  default: true
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "create_black_litterman_views",
            description: "Interactive guide for creating Black-Litterman investment views with examples and best practices",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols to create example views for",
                  default: ["AAPL", "MSFT"]
                },
                view_examples: {
                  type: "boolean",
                  description: "Include practical view examples",
                  default: true
                },
                technical_analysis: {
                  type: "boolean",
                  description: "Include guidance on creating views from technical analysis",
                  default: false
                },
                fundamental_analysis: {
                  type: "boolean",
                  description: "Include guidance on creating views from fundamental analysis",
                  default: false
                }
              }
            }
          },
          {
            name: "optimize_risk_parity",
            description: "Risk Parity portfolio optimization where each asset contributes equally to portfolio risk, providing better diversification than equal-weight portfolios",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for Risk Parity optimization (e.g., ['AAPL', 'MSFT', 'GOOGL', 'AMZN'])",
                  default: ["AAPL", "MSFT", "GOOGL", "AMZN"]
                },
                method: {
                  type: "string",
                  enum: ["standard", "constrained", "hierarchical"],
                  description: "Risk Parity optimization method",
                  default: "standard"
                },
                min_weights: {
                  type: "array",
                  items: { type: "number" },
                  description: "Minimum weight constraints for each asset (e.g., [0.05, 0.05, 0.05, 0.05] for 5% minimum)"
                },
                max_weights: {
                  type: "array",
                  items: { type: "number" },
                  description: "Maximum weight constraints for each asset (e.g., [0.4, 0.4, 0.4, 0.4] for 40% maximum)"
                },
                analysis_period: {
                  type: "number",
                  description: "Number of trading days for covariance estimation (default: 252 = 1 year)",
                  default: 252,
                  minimum: 60,
                  maximum: 1260
                },
                max_iterations: {
                  type: "number",
                  description: "Maximum optimization iterations (default: 100)",
                  default: 100,
                  minimum: 10,
                  maximum: 500
                },
                tolerance: {
                  type: "number",
                  description: "Convergence tolerance (default: 1e-6)",
                  default: 1e-6,
                  minimum: 1e-8,
                  maximum: 1e-3
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for optimization",
                  default: true
                },
                include_comparison: {
                  type: "boolean",
                  description: "Include comparison with equal-weight portfolio",
                  default: true
                },
                benchmark_symbol: {
                  type: "string",
                  description: "Benchmark symbol for performance comparison",
                  default: "SPY"
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "compare_risk_parity_methods",
            description: "Compare different Risk Parity optimization methods (Standard, Constrained, Hierarchical) side-by-side with detailed analysis",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for Risk Parity comparison (e.g., ['AAPL', 'MSFT', 'GOOGL', 'AMZN'])",
                  default: ["AAPL", "MSFT", "GOOGL", "AMZN"]
                },
                analysis_period: {
                  type: "number",
                  description: "Number of trading days for analysis (default: 252 = 1 year)",
                  default: 252,
                  minimum: 60,
                  maximum: 1260
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for comparison",
                  default: true
                },
                include_hierarchical: {
                  type: "boolean",
                  description: "Include Hierarchical Risk Parity in comparison",
                  default: true
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "run_backtesting_analysis",
            description: "Comprehensive backtesting analysis with transaction costs, rebalancing strategies, and performance metrics",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for backtesting (e.g., ['AAPL', 'MSFT', 'GOOGL'])",
                  default: ["AAPL", "MSFT", "GOOGL"]
                },
                strategy: {
                  type: "string",
                  enum: ["equal_weight", "mean_variance", "black_litterman", "risk_parity"],
                  description: "Portfolio strategy to backtest",
                  default: "equal_weight"
                },
                initial_cash: {
                  type: "number",
                  description: "Initial portfolio value",
                  default: 100000
                },
                rebalance_frequency: {
                  type: "string",
                  enum: ["daily", "weekly", "monthly", "quarterly"],
                  description: "Portfolio rebalancing frequency",
                  default: "monthly"
                },
                transaction_cost: {
                  type: "number",
                  description: "Transaction cost as percentage (e.g., 0.001 for 0.1%)",
                  default: 0.001
                },
                backtest_period: {
                  type: "number",
                  description: "Number of trading days to backtest (default: 252 = 1 year)",
                  default: 252,
                  minimum: 60,
                  maximum: 1260
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for backtesting",
                  default: true
                }
              },
              required: ["symbols", "strategy"]
            }
          },
          {
            name: "run_walk_forward_test",
            description: "Walk-forward optimization testing to validate strategy robustness over time",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for walk-forward testing",
                  default: ["AAPL", "MSFT", "GOOGL"]
                },
                strategy: {
                  type: "string",
                  enum: ["mean_variance", "black_litterman", "risk_parity"],
                  description: "Portfolio strategy to test",
                  default: "mean_variance"
                },
                in_sample_period: {
                  type: "number",
                  description: "In-sample optimization period in days",
                  default: 252
                },
                out_of_sample_period: {
                  type: "number",
                  description: "Out-of-sample testing period in days",
                  default: 63
                },
                step_size: {
                  type: "number",
                  description: "Step size for rolling window in days",
                  default: 21
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for testing",
                  default: true
                }
              },
              required: ["symbols", "strategy"]
            }
          },
          {
            name: "run_strategy_comparison",
            description: "Comprehensive comparison of multiple portfolio strategies with backtesting, walk-forward analysis, and Monte Carlo validation",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for strategy comparison",
                  default: ["AAPL", "MSFT", "GOOGL", "AMZN"]
                },
                strategies: {
                  type: "array",
                  items: { type: "string" },
                  description: "Strategies to compare",
                  default: ["equal_weight", "mean_variance", "black_litterman", "risk_parity"]
                },
                comparison_period: {
                  type: "number",
                  description: "Number of trading days for comparison analysis",
                  default: 504,
                  minimum: 252,
                  maximum: 1260
                },
                rebalance_frequency: {
                  type: "string",
                  enum: ["weekly", "monthly", "quarterly"],
                  description: "Rebalancing frequency for all strategies",
                  default: "monthly"
                },
                benchmark_symbol: {
                  type: "string",
                  description: "Benchmark for performance comparison",
                  default: "SPY"
                },
                monte_carlo_sims: {
                  type: "number",
                  description: "Number of Monte Carlo simulations for robustness testing",
                  default: 1000,
                  minimum: 100,
                  maximum: 5000
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for comparison",
                  default: true
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "run_monte_carlo_robustness_test",
            description: "Monte Carlo robustness testing for portfolio strategies with confidence intervals and parameter sensitivity analysis",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of stock symbols for robustness testing",
                  default: ["AAPL", "MSFT", "GOOGL"]
                },
                strategy: {
                  type: "string",
                  enum: ["mean_variance", "black_litterman", "risk_parity"],
                  description: "Portfolio strategy to test for robustness",
                  default: "mean_variance"
                },
                num_simulations: {
                  type: "number",
                  description: "Number of Monte Carlo simulations",
                  default: 1000,
                  minimum: 100,
                  maximum: 10000
                },
                confidence_level: {
                  type: "number",
                  description: "Confidence level for intervals (e.g., 0.95 for 95%)",
                  default: 0.95,
                  minimum: 0.8,
                  maximum: 0.99
                },
                parameter_perturbation: {
                  type: "number",
                  description: "Parameter perturbation level (0-1 scale)",
                  default: 0.1,
                  minimum: 0.01,
                  maximum: 0.5
                },
                block_size: {
                  type: "number",
                  description: "Block size for bootstrap sampling (days)",
                  default: 21,
                  minimum: 5,
                  maximum: 60
                },
                use_market_data: {
                  type: "boolean",
                  description: "Use real market data for robustness testing",
                  default: true
                }
              },
              required: ["symbols", "strategy"]
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "generate_payoff_diagram":
            return await generatePayoffDiagram(args);
            
          case "run_monte_carlo_simulation":
            return await runMonteCarloSimulation(args);
            
          case "stress_test_scenarios":
            return await stressTestScenarios(args);
            
          case "optimize_structure":
            return await optimizeStructure(args);
            
          case "cache_status":
            return await getCacheStatus();
            
          case "test_cache":
            return await testCache(args);
            
          case "build_portfolio":
            return await buildPortfolio(args);
            
          case "analyze_stock":
            return await analyzeStock(args);
            
          case "analyze_advanced_risk":
            return await analyzeAdvancedRisk(args);
            
          case "analyze_risk_attribution":
            return await analyzeRiskAttribution(args);
            
          case "optimize_black_litterman":
            return await optimizeBlackLitterman(args);
            
          case "create_black_litterman_views":
            return await createBlackLittermanViews(args);
            
          case "optimize_risk_parity":
            return await optimizeRiskParity(args);
            
          case "compare_risk_parity_methods":
            return await compareRiskParityMethods(args);
            
          case "run_backtesting_analysis":
            return await runBacktestingAnalysis(args);
            
          case "run_walk_forward_test":
            return await runWalkForwardTest(args);
            
          case "run_strategy_comparison":
            return await runStrategyComparison(args);
            
          case "run_monte_carlo_robustness_test":
            return await runMonteCarloRobustnessTest(args);
            
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${name}: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // MCP server running on stdio - console output removed to prevent interference
  }
}

// Start the server
const server = new FinancialStructuredProductsServer();
server.run().catch(console.error);