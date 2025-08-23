#!/usr/bin/env node

// Test Alpha Vantage API integration

import { generatePayoffDiagram } from './tools/payoff-diagram.js';
import { runMonteCarloSimulation } from './tools/monte-carlo.js';
import marketData from './services/market-data.js';
import alphaVantageClient from './utils/alpha-vantage-client.js';

async function testAlphaVantageIntegration() {
  console.error('🧪 Testing Alpha Vantage API Integration\n');
  
  // Test 1: API Connection
  console.error('🔌 Test 1: Alpha Vantage API Connection');
  const connectionTest = await alphaVantageClient.testConnection();
  console.error(`Connection test: ${connectionTest ? '✅ Success' : '❌ Failed'}\n`);
  
  // Test 2: Market Data Service Health Check  
  console.error('🏥 Test 2: Market Data Service Health Check');
  try {
    const healthCheck = await marketData.healthCheck();
    console.error('✅ Health check completed:');
    console.error(`- API Connection: ${healthCheck.apiConnection ? '✅' : '❌'}`);
    console.error(`- Cache entries: ${healthCheck.cache?.totalEntries || 0}`);
    console.error(`- Rate limit calls: ${healthCheck.rateLimitStatus?.callsInWindow}/${healthCheck.rateLimitStatus?.maxCalls}`);
    console.error('');
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
  
  // Test 3: Fetch Real Market Data
  console.error('📊 Test 3: Fetch Real Market Data for AAPL');
  try {
    const applPrice = await marketData.getCurrentPrice('AAPL');
    console.error(`✅ AAPL Current Price: $${applPrice.price} (${applPrice.changePercent})`);
    
    const applHistory = await marketData.getHistoricalPrices('AAPL', 'compact');
    console.error(`✅ Historical data: ${applHistory.dates.length} trading days`);
    
    const riskFreeRate = await marketData.getRiskFreeRate('10year');
    console.error(`✅ 10-Year Treasury: ${(riskFreeRate.rate * 100).toFixed(2)}%\n`);
  } catch (error) {
    console.error(`❌ Market data fetch failed: ${error.message}\n`);
  }
  
  // Test 4: Enhanced Payoff Diagram with Real Data
  console.error('📈 Test 4: Payoff Diagram with Real Market Data');
  try {
    const payoffResult = await generatePayoffDiagram({
      product_type: 'call',
      underlying_price: 150, // This will be overridden by real data
      strike_price: 155,
      time_to_expiry: 0.25,
      symbol: 'AAPL',
      use_market_data: true
    });
    
    console.error('✅ Payoff diagram with real market data generated successfully');
    console.error('Sample output:');
    console.error(payoffResult.content[0].text.substring(0, 400) + '...\n');
  } catch (error) {
    console.error(`❌ Enhanced payoff diagram failed: ${error.message}\n`);
  }
  
  // Test 5: Monte Carlo with Real Volatility
  console.error('🎲 Test 5: Monte Carlo Simulation with Real Market Data');
  try {
    const mcResult = await runMonteCarloSimulation({
      product_type: 'call',
      underlying_price: 150, // Will be overridden
      strike_price: 155,
      volatility: 0.25, // Will be overridden by historical volatility
      risk_free_rate: 0.05, // Will be overridden by Treasury rate
      time_to_expiry: 0.25,
      num_simulations: 1000,
      symbol: 'AAPL',
      use_market_data: true
    });
    
    console.error('✅ Monte Carlo with real market data completed successfully');
    console.error('Sample output:');
    console.error(mcResult.content[0].text.substring(0, 500) + '...\n');
  } catch (error) {
    console.error(`❌ Enhanced Monte Carlo failed: ${error.message}\n`);
  }
  
  // Test 6: Rate Limiting
  console.error('⏱️ Test 6: Rate Limiting Status');
  const rateLimitStatus = alphaVantageClient.getRateLimitStatus();
  console.error(`Rate limit status: ${rateLimitStatus.callsInWindow}/${rateLimitStatus.maxCalls} calls used`);
  console.error(`Can make call: ${rateLimitStatus.canMakeCall ? '✅' : '❌'}`);
  if (rateLimitStatus.timeToReset > 0) {
    console.error(`Time to reset: ${Math.ceil(rateLimitStatus.timeToReset / 1000)}s`);
  }
  
  console.error('\n🎉 Alpha Vantage integration test completed!');
  
  // Usage examples
  console.error('\n💡 Usage Examples:');
  console.error('\n1. Real-time payoff diagram:');
  console.error('generatePayoffDiagram({');
  console.error('  product_type: "call",');
  console.error('  strike_price: 200,');
  console.error('  symbol: "TSLA",');
  console.error('  use_market_data: true');
  console.error('})');
  
  console.error('\n2. Monte Carlo with live data:');
  console.error('runMonteCarloSimulation({');
  console.error('  product_type: "barrier_option",');
  console.error('  strike_price: 150,');
  console.error('  barrier_level: 120,');
  console.error('  time_to_expiry: 0.5,');
  console.error('  symbol: "NVDA",');
  console.error('  use_market_data: true,');
  console.error('  num_simulations: 10000');
  console.error('})');
}

// Run the tests
testAlphaVantageIntegration().catch(console.error);