#!/usr/bin/env node

// Test Phase 2: Complete Market Data Integration

import { generatePayoffDiagram } from './tools/payoff-diagram.js';
import { runMonteCarloSimulation } from './tools/monte-carlo.js';
import { stressTestScenarios } from './tools/scenario-analysis.js';
import { optimizeStructure } from './tools/optimization.js';

async function testPhase2Integration() {
  console.error('🧪 Testing Phase 2: Complete Market Data Integration\n');
  
  // Test 1: Enhanced Payoff Diagram with Market Data
  console.error('📈 Test 1: Enhanced Payoff Diagram with Real Market Data');
  try {
    const result1 = await generatePayoffDiagram({
      product_type: 'call',
      underlying_price: 150, // Will be overridden by real AAPL price
      strike_price: 230,
      time_to_expiry: 0.25,
      symbol: 'AAPL',
      use_market_data: true
    });
    
    console.error('✅ Enhanced payoff diagram completed');
    // Check for market context in output
    if (result1.content[0].text.includes('Market Data Context')) {
      console.error('✅ Market data context included in report');
    }
    console.error('Sample output:');
    console.error(result1.content[0].text.substring(0, 500) + '...\n');
  } catch (error) {
    console.error(`❌ Enhanced payoff diagram failed: ${error.message}\n`);
  }
  
  // Test 2: Monte Carlo with Real Volatility and Rates
  console.error('🎲 Test 2: Monte Carlo Simulation with Real Market Parameters');
  try {
    const result2 = await runMonteCarloSimulation({
      product_type: 'barrier_option',
      underlying_price: 200, // Will be overridden
      strike_price: 230,
      volatility: 0.20, // Will be overridden by calculated volatility
      risk_free_rate: 0.05, // Will be overridden by Treasury rate
      time_to_expiry: 0.5,
      barrier_level: 200,
      symbol: 'AAPL',
      use_market_data: true,
      num_simulations: 2000
    });
    
    console.error('✅ Enhanced Monte Carlo completed');
    if (result2.content[0].text.includes('Market Data Context')) {
      console.error('✅ Market data context included in Monte Carlo report');
    }
    console.error('Sample output:');
    console.error(result2.content[0].text.substring(0, 400) + '...\n');
  } catch (error) {
    console.error(`❌ Enhanced Monte Carlo failed: ${error.message}\n`);
  }
  
  // Test 3: Stress Testing with Historical Market Crises
  console.error('⚡ Test 3: Stress Testing with Historical Market Crises');
  try {
    const result3 = await stressTestScenarios({
      product_type: 'autocallable',
      underlying_price: 200, // Will be overridden
      strike_price: 190,
      volatility: 0.25, // Will be calculated
      barrier_level: 160,
      time_to_expiry: 1,
      symbol: 'AAPL',
      use_market_data: true,
      include_historical_scenarios: true,
      // Test custom scenarios along with historical ones
      scenarios: [
        {
          name: "Custom Future Scenario",
          price_shock: -0.25,
          vol_shock: 0.15,
          rate_shock: -0.02
        }
      ]
    });
    
    console.error('✅ Enhanced stress testing completed');
    if (result3.content[0].text.includes('2008 Financial Crisis')) {
      console.error('✅ Historical market crisis scenarios included');
    }
    if (result3.content[0].text.includes('Market Data Context')) {
      console.error('✅ Market data context included in stress test report');
    }
    console.error('Sample output:');
    console.error(result3.content[0].text.substring(0, 600) + '...\n');
  } catch (error) {
    console.error(`❌ Enhanced stress testing failed: ${error.message}\n`);
  }
  
  // Test 4: Structure Optimization with Market Regime Awareness
  console.error('🎯 Test 4: Structure Optimization with Market Data and Regime Awareness');
  try {
    const result4 = await optimizeStructure({
      product_type: 'autocallable',
      underlying_price: 200, // Will be overridden
      volatility: 0.30, // Will be calculated
      target_return: 0.12,
      time_to_expiry: 1,
      risk_tolerance: 0.6,
      symbol: 'AAPL',
      use_market_data: true,
      market_regime_aware: true // NEW: Adjust for volatility regime
    });
    
    console.error('✅ Enhanced optimization completed');
    if (result4.content[0].text.includes('Volatility Regime')) {
      console.error('✅ Volatility regime awareness included');
    }
    if (result4.content[0].text.includes('Market Data Context')) {
      console.error('✅ Market data context included in optimization report');
    }
    console.error('Sample output:');
    console.error(result4.content[0].text.substring(0, 500) + '...\n');
  } catch (error) {
    console.error(`❌ Enhanced optimization failed: ${error.message}\n`);
  }
  
  // Test 5: All Tools Working Without Market Data (Backward Compatibility)
  console.error('🔧 Test 5: Backward Compatibility (Without Market Data)');
  try {
    const backwardTest = await generatePayoffDiagram({
      product_type: 'put',
      underlying_price: 200,
      strike_price: 210,
      volatility: 0.25,
      risk_free_rate: 0.05,
      time_to_expiry: 0.5
      // No symbol or use_market_data - should work with static parameters
    });
    
    console.error('✅ Backward compatibility confirmed - tools work without market data');
    console.error('');
  } catch (error) {
    console.error(`❌ Backward compatibility test failed: ${error.message}\n`);
  }
  
  console.error('🎉 Phase 2 Integration Testing Complete!\n');
  
  // Summary of new capabilities
  console.error('🚀 Phase 2 New Capabilities Summary:');
  console.error('\n📈 **Enhanced Payoff Diagrams:**');
  console.error('- Real-time stock prices replace static examples');
  console.error('- Historical volatility calculated from market data');
  console.error('- Current Treasury rates for accurate pricing');
  console.error('- Market context included in all reports');
  
  console.error('\n🎲 **Enhanced Monte Carlo Simulations:**');
  console.error('- Uses calculated historical volatility (much more accurate!)');
  console.error('- Real risk-free rates from Treasury data');
  console.error('- Market data timestamp for data freshness tracking');
  
  console.error('\n⚡ **Enhanced Stress Testing:**');
  console.error('- Historical market crisis scenarios (2008, 2020, Dot-com, etc.)');
  console.error('- Real market parameters as base case');
  console.error('- Market context shows current conditions vs stress scenarios');
  
  console.error('\n🎯 **Enhanced Optimization:**');
  console.error('- Market regime awareness (adjusts risk tolerance for volatility environment)');
  console.error('- Real dividend yields from company data');
  console.error('- Current market parameters for realistic optimization');
  console.error('- Volatility regime detection (low/medium/high/extreme)');
  
  console.error('\n💡 **Example Usage with Real Market Data:**');
  console.error(`
// Tesla autocallable with live data
optimizeStructure({
  product_type: "autocallable",
  target_return: 0.15,
  time_to_expiry: 1,
  symbol: "TSLA",
  use_market_data: true,
  market_regime_aware: true
})

// Stress test Apple barrier option against historical crises  
stressTestScenarios({
  product_type: "barrier_option", 
  strike_price: 220,
  barrier_level: 180,
  symbol: "AAPL",
  use_market_data: true,
  include_historical_scenarios: true
})
`);
}

// Run Phase 2 tests
testPhase2Integration().catch(console.error);