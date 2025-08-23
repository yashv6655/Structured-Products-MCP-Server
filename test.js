#!/usr/bin/env node

// Test script for the Financial Structured Products MCP Server

import { generatePayoffDiagram } from './tools/payoff-diagram.js';
import { runMonteCarloSimulation } from './tools/monte-carlo.js';
import { stressTestScenarios } from './tools/scenario-analysis.js';
import { optimizeStructure } from './tools/optimization.js';

async function runTests() {
  console.error('Testing Financial Structured Products MCP Server\n');
  
  // Test 1: Payoff Diagram for Call Option
  console.error('📈 Test 1: Generate Call Option Payoff Diagram');
  try {
    const result1 = await generatePayoffDiagram({
      product_type: 'call',
      underlying_price: 100,
      strike_price: 105,
      time_to_expiry: 0.25,
      price_range: { min: 80, max: 120, steps: 20 }
    });
    console.error('✅ Call option payoff diagram generated successfully');
    console.error(result1.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  // Test 2: Autocallable Payoff Diagram  
  console.error('📊 Test 2: Generate Autocallable Payoff Diagram');
  try {
    const result2 = await generatePayoffDiagram({
      product_type: 'autocallable',
      underlying_price: 100,
      strike_price: 90,
      barrier_price: 70,
      time_to_expiry: 1,
      price_range: { min: 60, max: 120, steps: 25 }
    });
    console.error('✅ Autocallable payoff diagram generated successfully\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  // Test 3: Monte Carlo Simulation
  console.error('🎲 Test 3: Monte Carlo Simulation for Barrier Option');
  try {
    const result3 = await runMonteCarloSimulation({
      product_type: 'barrier_option',
      underlying_price: 100,
      strike_price: 105,
      volatility: 0.25,
      risk_free_rate: 0.05,
      time_to_expiry: 1,
      barrier_level: 80,
      num_simulations: 1000
    });
    console.error('✅ Monte Carlo simulation completed successfully');
    console.error('Sample result:', result3.content[0].text.substring(0, 300) + '...\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  // Test 4: Stress Test Scenarios
  console.error('⚡ Test 4: Stress Test Analysis');
  try {
    const result4 = await stressTestScenarios({
      product_type: 'autocallable',
      underlying_price: 100,
      strike_price: 90,
      volatility: 0.20,
      barrier_level: 70,
      scenarios: [
        { name: 'Market Crash', price_shock: -0.30, vol_shock: 0.10, rate_shock: -0.02 },
        { name: 'Bull Market', price_shock: 0.20, vol_shock: -0.05, rate_shock: 0.01 }
      ]
    });
    console.error('✅ Stress test analysis completed successfully\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  // Test 5: Structure Optimization
  console.error('🎯 Test 5: Structure Optimization');
  try {
    const result5 = await optimizeStructure({
      product_type: 'call',
      underlying_price: 100,
      volatility: 0.25,
      target_return: 0.15,
      time_to_expiry: 1,
      risk_tolerance: 0.5
    });
    console.error('✅ Structure optimization completed successfully');
    console.error('Optimization preview:', result5.content[0].text.substring(0, 400) + '...\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.error('🎉 All tests completed!\n');
  
  // Example usage for Claude Code integration
  console.error('💡 Example usage for Claude Code:');
  console.error('Add this server to your Claude Code MCP configuration:');
  console.error(`
{
  "mcpServers": {
    "financial-structured-products": {
      "command": "node",
      "args": ["${process.cwd()}/server.js"]
    }
  }
}
`);
}

// Run the tests
runTests().catch(console.error);