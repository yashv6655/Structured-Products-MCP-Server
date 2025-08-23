import { Matrix } from 'ml-matrix';
import { mean, standardDeviation, variance, sampleCorrelation } from 'simple-statistics';
import { BacktestingEngine, TransactionCostModel, PortfolioState, RebalancingStrategy } from './backtesting-engine.js';
import { WalkForwardAnalysis, WalkForwardConfig, PortfolioStrategyOptimizer } from './walk-forward-analysis.js';
import { MonteCarloConfidenceEngine, BlockBootstrapSampler } from './monte-carlo-confidence.js';
import { 
    calculatePortfolioVolatility,
    blackLittermanOptimization,
    optimizeRiskParity,
    calculateAdvancedRiskMetrics,
    optimizePortfolioMinVariance
} from './portfolio-math.js';

/**
 * Strategy comparison framework supporting multiple portfolio optimization methodologies
 * Implements comprehensive comparison including backtesting, walk-forward analysis, and Monte Carlo validation
 */
export class StrategyComparisonFramework {
    constructor(config = {}) {
        this.symbols = config.symbols || [];
        this.riskFreeRate = config.riskFreeRate || 0.02;
        this.rebalanceFrequency = config.rebalanceFrequency || 'quarterly';
        this.transactionCosts = config.transactionCosts || new TransactionCostModel();
        
        // Comparison parameters
        this.lookbackWindow = config.lookbackWindow || 252; // 1 year
        this.minObservations = config.minObservations || 60; // Minimum 3 months
        this.confidenceLevel = config.confidenceLevel || 0.95;
        this.monteCarloSims = config.monteCarloSims || 1000;
        
        // Strategy configurations
        this.strategies = this.initializeStrategies(config.strategyConfigs || {});
    }

    initializeStrategies(configs = {}) {
        return {
            meanVariance: {
                name: 'Mean-Variance Optimization',
                optimize: this.meanVarianceStrategy.bind(this),
                config: {
                    targetReturn: configs.meanVariance?.targetReturn || 0.08,
                    riskTolerance: configs.meanVariance?.riskTolerance || 0.5,
                    constraints: configs.meanVariance?.constraints || { minWeight: 0.01, maxWeight: 0.4 }
                }
            },
            blackLitterman: {
                name: 'Black-Litterman',
                optimize: this.blackLittermanStrategy.bind(this),
                config: {
                    tau: configs.blackLitterman?.tau || 0.025,
                    confidenceLevel: configs.blackLitterman?.confidenceLevel || 0.25,
                    views: configs.blackLitterman?.views || [],
                    viewUncertainty: configs.blackLitterman?.viewUncertainty || 0.1
                }
            },
            riskParity: {
                name: 'Risk Parity',
                optimize: this.riskParityStrategy.bind(this),
                config: {
                    method: configs.riskParity?.method || 'equal_risk_contribution',
                    riskBudgets: configs.riskParity?.riskBudgets || null,
                    constraints: configs.riskParity?.constraints || { minWeight: 0.01, maxWeight: 0.5 }
                }
            },
            equalWeight: {
                name: 'Equal Weight (Benchmark)',
                optimize: this.equalWeightStrategy.bind(this),
                config: {}
            }
        };
    }

    async meanVarianceStrategy(returns, config) {
        const expectedReturns = returns.map(series => mean(series));
        const covMatrix = this.calculateCovarianceMatrix(returns);
        
        return optimizePortfolioMinVariance(
            expectedReturns,
            covMatrix,
            config.targetReturn
        );
    }

    async blackLittermanStrategy(returns, config) {
        const expectedReturns = returns.map(series => mean(series));
        const covMatrix = this.calculateCovarianceMatrix(returns);
        
        // Generate market cap weights as prior (simplified)
        const marketWeights = new Array(this.symbols.length).fill(1 / this.symbols.length);
        
        return blackLittermanOptimization(
            expectedReturns,
            covMatrix,
            marketWeights,
            config.views,
            [],
            config.tau,
            3.0
        ).weights;
    }

    async riskParityStrategy(returns, config) {
        const covMatrix = this.calculateCovarianceMatrix(returns);
        
        return optimizeRiskParity(covMatrix).weights;
    }

    async equalWeightStrategy(returns, config) {
        const numAssets = this.symbols.length;
        return new Array(numAssets).fill(1 / numAssets);
    }

    calculateCovarianceMatrix(returns) {
        const numAssets = returns.length;
        const covMatrix = new Matrix(numAssets, numAssets);
        
        for (let i = 0; i < numAssets; i++) {
            for (let j = 0; j < numAssets; j++) {
                if (i === j) {
                    covMatrix.set(i, j, variance(returns[i]));
                } else {
                    const correlation = sampleCorrelation(returns[i], returns[j]);
                    const covariance = correlation * standardDeviation(returns[i]) * standardDeviation(returns[j]);
                    covMatrix.set(i, j, covariance);
                }
            }
        }
        
        return covMatrix;
    }

    /**
     * Run comprehensive strategy comparison across all methodologies
     */
    async runFullComparison(priceData, benchmarkData = null) {
        const results = {
            strategies: {},
            rankings: {},
            robustnessAnalysis: {},
            summary: {}
        };

        // Calculate returns for all assets
        const returns = this.calculateReturnsMatrix(priceData);
        
        // Run each strategy
        for (const [strategyName, strategy] of Object.entries(this.strategies)) {
            console.log(`Running strategy: ${strategy.name}`);
            
            try {
                const strategyResult = await this.runSingleStrategy(
                    strategyName,
                    strategy,
                    returns,
                    priceData,
                    benchmarkData
                );
                
                results.strategies[strategyName] = strategyResult;
            } catch (error) {
                console.error(`Error in strategy ${strategy.name}:`, error.message);
                results.strategies[strategyName] = { error: error.message };
            }
        }

        // Calculate rankings and comparative analysis
        results.rankings = this.calculateStrategyRankings(results.strategies);
        results.robustnessAnalysis = await this.performRobustnessAnalysis(returns, priceData);
        results.summary = this.generateComparisonSummary(results);

        return results;
    }

    async runSingleStrategy(strategyName, strategy, returns, priceData, benchmarkData) {
        const result = {
            name: strategy.name,
            config: strategy.config
        };

        // 1. Basic portfolio optimization
        const weights = await strategy.optimize(returns, strategy.config);
        result.weights = weights;

        // 2. Backtesting analysis
        result.backtesting = await this.runBacktesting(strategyName, weights, priceData);

        // 3. Walk-forward analysis
        result.walkForward = await this.runWalkForwardAnalysis(strategyName, strategy, priceData);

        // 4. Monte Carlo confidence intervals
        result.monteCarlo = await this.runMonteCarloAnalysis(strategyName, strategy, returns);

        // 5. Risk metrics
        const portfolioReturns = this.calculatePortfolioReturns(weights, returns);
        result.riskMetrics = calculateAdvancedRiskMetrics(
            portfolioReturns,
            this.riskFreeRate,
            benchmarkData ? this.calculateReturns(benchmarkData) : null
        );

        // 6. Performance attribution  
        result.performance = this.calculatePerformanceMetrics(portfolioReturns, this.riskFreeRate);

        return result;
    }

    async runBacktesting(strategyName, weights, priceData) {
        const engine = new BacktestingEngine({
            initialCash: 100000,
            symbols: this.symbols,
            transactionCostModel: this.transactionCosts
        });

        const rebalancingStrategy = new RebalancingStrategy({
            frequency: this.rebalanceFrequency,
            targetWeights: weights,
            threshold: 0.05
        });

        return await engine.runBacktest(priceData, rebalancingStrategy);
    }

    async runWalkForwardAnalysis(strategyName, strategy, priceData) {
        const config = new WalkForwardConfig({
            inSamplePeriod: 252,    // 1 year
            outOfSamplePeriod: 63,  // 3 months
            stepSize: 21,           // 1 month
            minObservations: this.minObservations
        });

        const optimizer = new PortfolioStrategyOptimizer(
            (returns) => strategy.optimize(returns, strategy.config)
        );

        const walkForward = new WalkForwardAnalysis(config, optimizer, this.symbols);
        return await walkForward.runWalkForwardAnalysis(priceData);
    }

    async runMonteCarloAnalysis(strategyName, strategy, returns) {
        const engine = new MonteCarloConfidenceEngine({
            numSimulations: this.monteCarloSims,
            confidenceLevel: this.confidenceLevel,
            blockSize: 21  // 1 month blocks
        });

        const strategyFunction = async (perturbedReturns) => {
            const weights = await strategy.optimize(perturbedReturns, strategy.config);
            const portfolioReturns = this.calculatePortfolioReturns(weights, perturbedReturns);
            return {
                weights,
                returns: portfolioReturns,
                sharpeRatio: mean(portfolioReturns) / standardDeviation(portfolioReturns) * Math.sqrt(252),
                volatility: standardDeviation(portfolioReturns) * Math.sqrt(252)
            };
        };

        return await engine.runConfidenceAnalysis(returns, strategyFunction);
    }

    calculateStrategyRankings(strategies) {
        const validStrategies = Object.entries(strategies).filter(([name, data]) => !data.error);
        
        if (validStrategies.length === 0) {
            return { error: 'No valid strategies to rank' };
        }

        const rankings = {
            sharpeRatio: [],
            totalReturn: [],
            maxDrawdown: [],
            volatility: [],
            robustness: [],
            overall: []
        };

        // Extract metrics for ranking
        const strategyMetrics = validStrategies.map(([name, data]) => ({
            name,
            sharpeRatio: data.riskMetrics?.sharpeRatio || 0,
            totalReturn: data.backtesting?.performance?.totalReturn || 0,
            maxDrawdown: Math.abs(data.riskMetrics?.maxDrawdown || 0),
            volatility: data.riskMetrics?.volatility || 0,
            robustness: data.monteCarlo?.robustnessScore || 0
        }));

        // Rank by each metric
        rankings.sharpeRatio = [...strategyMetrics].sort((a, b) => b.sharpeRatio - a.sharpeRatio);
        rankings.totalReturn = [...strategyMetrics].sort((a, b) => b.totalReturn - a.totalReturn);
        rankings.maxDrawdown = [...strategyMetrics].sort((a, b) => a.maxDrawdown - b.maxDrawdown); // Lower is better
        rankings.volatility = [...strategyMetrics].sort((a, b) => a.volatility - b.volatility); // Lower is better
        rankings.robustness = [...strategyMetrics].sort((a, b) => b.robustness - a.robustness);

        // Calculate overall ranking using weighted scores
        const weights = {
            sharpeRatio: 0.3,
            totalReturn: 0.25,
            maxDrawdown: 0.2,
            volatility: 0.15,
            robustness: 0.1
        };

        const overallScores = strategyMetrics.map(strategy => {
            let score = 0;
            const numStrategies = strategyMetrics.length;

            // Sharpe ratio (higher is better)
            const sharpeRank = rankings.sharpeRatio.findIndex(s => s.name === strategy.name);
            score += weights.sharpeRatio * (numStrategies - sharpeRank);

            // Total return (higher is better)
            const returnRank = rankings.totalReturn.findIndex(s => s.name === strategy.name);
            score += weights.totalReturn * (numStrategies - returnRank);

            // Max drawdown (lower is better)
            const drawdownRank = rankings.maxDrawdown.findIndex(s => s.name === strategy.name);
            score += weights.maxDrawdown * (drawdownRank + 1);

            // Volatility (lower is better)
            const volRank = rankings.volatility.findIndex(s => s.name === strategy.name);
            score += weights.volatility * (volRank + 1);

            // Robustness (higher is better)
            const robustRank = rankings.robustness.findIndex(s => s.name === strategy.name);
            score += weights.robustness * (numStrategies - robustRank);

            return { name: strategy.name, score };
        });

        rankings.overall = overallScores.sort((a, b) => b.score - a.score);

        return rankings;
    }

    async performRobustnessAnalysis(returns, priceData) {
        const analysis = {
            correlationStability: {},
            parameterSensitivity: {},
            outOfSampleConsistency: {}
        };

        // Test correlation stability over different time windows
        const windowSizes = [63, 126, 252]; // 3, 6, 12 months
        for (const windowSize of windowSizes) {
            const rollingCorrelations = this.calculateRollingCorrelations(returns, windowSize);
            analysis.correlationStability[`${windowSize}d`] = {
                meanCorrelation: mean(rollingCorrelations.flat()),
                correlationVolatility: standardDeviation(rollingCorrelations.flat()),
                stability: this.calculateCorrelationStability(rollingCorrelations)
            };
        }

        // Parameter sensitivity analysis for key strategies
        for (const [strategyName, strategy] of Object.entries(this.strategies)) {
            if (strategyName === 'equalWeight') continue; // Skip benchmark
            
            analysis.parameterSensitivity[strategyName] = 
                await this.testParameterSensitivity(strategy, returns);
        }

        return analysis;
    }

    calculateRollingCorrelations(returns, windowSize) {
        const correlations = [];
        const numAssets = returns.length;
        
        for (let i = windowSize; i < returns[0].length; i++) {
            const windowCorrelations = [];
            for (let j = 0; j < numAssets; j++) {
                for (let k = j + 1; k < numAssets; k++) {
                    const series1 = returns[j].slice(i - windowSize, i);
                    const series2 = returns[k].slice(i - windowSize, i);
                    windowCorrelations.push(sampleCorrelation(series1, series2));
                }
            }
            correlations.push(windowCorrelations);
        }
        
        return correlations;
    }

    calculateCorrelationStability(rollingCorrelations) {
        // Measure how stable correlations are over time
        const stabilities = [];
        
        for (let i = 0; i < rollingCorrelations[0].length; i++) {
            const correlationSeries = rollingCorrelations.map(window => window[i]);
            stabilities.push(1 - (standardDeviation(correlationSeries) / Math.abs(mean(correlationSeries))));
        }
        
        return mean(stabilities);
    }

    async testParameterSensitivity(strategy, returns) {
        const baseConfig = { ...strategy.config };
        const sensitivity = {};
        
        // Test key parameters based on strategy type
        if (strategy.name.includes('Mean-Variance')) {
            const targetReturns = [0.06, 0.08, 0.10, 0.12];
            sensitivity.targetReturn = await this.testParameterRange(
                strategy, returns, 'targetReturn', targetReturns, baseConfig
            );
        } else if (strategy.name.includes('Black-Litterman')) {
            const taus = [0.01, 0.025, 0.05, 0.1];
            sensitivity.tau = await this.testParameterRange(
                strategy, returns, 'tau', taus, baseConfig
            );
        }
        
        return sensitivity;
    }

    async testParameterRange(strategy, returns, paramName, values, baseConfig) {
        const results = [];
        
        for (const value of values) {
            const testConfig = { ...baseConfig, [paramName]: value };
            try {
                const weights = await strategy.optimize(returns, testConfig);
                const portfolioReturns = this.calculatePortfolioReturns(weights, returns);
                const sharpe = mean(portfolioReturns) / standardDeviation(portfolioReturns) * Math.sqrt(252);
                
                results.push({
                    parameterValue: value,
                    sharpeRatio: sharpe,
                    weights: weights
                });
            } catch (error) {
                results.push({
                    parameterValue: value,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    generateComparisonSummary(results) {
        const summary = {
            bestStrategy: null,
            keyInsights: [],
            recommendations: [],
            riskProfile: {}
        };

        // Identify best overall strategy
        if (results.rankings.overall && results.rankings.overall.length > 0) {
            const topStrategy = results.rankings.overall[0];
            summary.bestStrategy = {
                name: topStrategy.name,
                score: topStrategy.score,
                reason: 'Highest weighted composite score across all metrics'
            };
        }

        // Generate key insights
        const validStrategies = Object.entries(results.strategies).filter(([name, data]) => !data.error);
        
        if (validStrategies.length > 0) {
            // Risk-return profile
            const riskReturns = validStrategies.map(([name, data]) => ({
                name,
                return: data.backtesting?.performance?.totalReturn || 0,
                risk: data.riskMetrics?.volatility || 0,
                sharpe: data.riskMetrics?.sharpeRatio || 0
            }));

            const highestReturn = Math.max(...riskReturns.map(s => s.return));
            const lowestRisk = Math.min(...riskReturns.map(s => s.risk));
            const highestSharpe = Math.max(...riskReturns.map(s => s.sharpe));

            summary.keyInsights.push(
                `Highest return: ${riskReturns.find(s => s.return === highestReturn)?.name} (${(highestReturn * 100).toFixed(2)}%)`,
                `Lowest risk: ${riskReturns.find(s => s.risk === lowestRisk)?.name} (${(lowestRisk * 100).toFixed(2)}% vol)`,
                `Best risk-adjusted return: ${riskReturns.find(s => s.sharpe === highestSharpe)?.name} (Sharpe: ${highestSharpe.toFixed(3)})`
            );

            // Risk profile analysis
            summary.riskProfile = {
                conservative: riskReturns.filter(s => s.risk < 0.15).map(s => s.name),
                moderate: riskReturns.filter(s => s.risk >= 0.15 && s.risk < 0.25).map(s => s.name),
                aggressive: riskReturns.filter(s => s.risk >= 0.25).map(s => s.name)
            };
        }

        // Generate recommendations
        if (results.robustnessAnalysis && Object.keys(results.robustnessAnalysis).length > 0) {
            const avgStability = mean(Object.values(results.robustnessAnalysis.correlationStability || {})
                .map(s => s.stability));
            
            if (avgStability < 0.7) {
                summary.recommendations.push('Consider shorter rebalancing periods due to low correlation stability');
            }
            
            if (avgStability > 0.85) {
                summary.recommendations.push('High correlation stability allows for longer rebalancing periods');
            }
        }

        return summary;
    }

    // Utility methods
    calculatePerformanceMetrics(returns, riskFreeRate = 0.02) {
        const meanReturn = mean(returns);
        const annualizedReturn = meanReturn * 252;
        const volatility = standardDeviation(returns) * Math.sqrt(252);
        
        return {
            totalReturn: annualizedReturn,
            volatility: volatility,
            sharpeRatio: (annualizedReturn - riskFreeRate) / volatility
        };
    }

    calculateReturnsMatrix(priceData) {
        return this.symbols.map(symbol => this.calculateReturns(priceData[symbol] || []));
    }

    calculateReturns(prices) {
        if (!prices || prices.length < 2) return [];
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        return returns;
    }

    calculatePortfolioReturns(weights, returns) {
        if (!weights || !returns || weights.length !== returns.length) return [];
        
        const numPeriods = Math.min(...returns.map(series => series.length));
        const portfolioReturns = [];
        
        for (let t = 0; t < numPeriods; t++) {
            let portfolioReturn = 0;
            for (let i = 0; i < weights.length; i++) {
                portfolioReturn += weights[i] * (returns[i][t] || 0);
            }
            portfolioReturns.push(portfolioReturn);
        }
        
        return portfolioReturns;
    }
}

/**
 * Specialized comparison for specific use cases
 */
export class StrategicAssetAllocation extends StrategyComparisonFramework {
    constructor(config = {}) {
        super({
            ...config,
            rebalanceFrequency: 'monthly',
            lookbackWindow: 756, // 3 years
            strategyConfigs: {
                meanVariance: {
                    targetReturn: 0.07,
                    riskTolerance: 0.4,
                    constraints: { minWeight: 0.05, maxWeight: 0.3 }
                },
                blackLitterman: {
                    tau: 0.05,
                    confidenceLevel: 0.1,
                    views: config.investorViews || []
                },
                riskParity: {
                    method: 'hierarchical',
                    constraints: { minWeight: 0.02, maxWeight: 0.4 }
                }
            }
        });
    }
}

export class TacticalAssetAllocation extends StrategyComparisonFramework {
    constructor(config = {}) {
        super({
            ...config,
            rebalanceFrequency: 'weekly',
            lookbackWindow: 126, // 6 months
            strategyConfigs: {
                meanVariance: {
                    targetReturn: 0.12,
                    riskTolerance: 0.8,
                    constraints: { minWeight: 0.0, maxWeight: 0.6 }
                },
                blackLitterman: {
                    tau: 0.01,
                    confidenceLevel: 0.3,
                    views: config.marketViews || []
                },
                riskParity: {
                    method: 'equal_risk_contribution',
                    constraints: { minWeight: 0.0, maxWeight: 0.5 }
                }
            }
        });
    }
}