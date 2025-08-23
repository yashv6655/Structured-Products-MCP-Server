#!/usr/bin/env node

// Test Cache Performance and Functionality

import { getCacheStatus, testCache } from './tools/cache-monitor.js';
import marketDataService from './services/market-data.js';
import dataCache from './utils/data-cache.js';

async function runCacheTests() {
  console.error('Cache Performance & Functionality Tests\n');
  
  // Test 1: Initial Cache Status (Should be empty)
  console.error('Test 1: Initial Cache Status');
  try {
    const initialStatus = await getCacheStatus();
    console.error('SUCCESS: Initial cache status retrieved');
    console.error('Sample output:');
    console.error(initialStatus.content[0].text.substring(0, 300) + '...\n');
  } catch (error) {
    console.error(`ERROR: Initial cache status failed: ${error.message}\n`);
  }
  
  // Test 2: Populate Cache with API Calls
  console.error('Test 2: Populating Cache with API Calls');
  try {
    console.error('Making API calls to populate cache...');
    
    const [price, history, treasury] = await Promise.all([
      marketDataService.getCurrentPrice('AAPL'),
      marketDataService.getHistoricalPrices('AAPL'),
      marketDataService.getRiskFreeRate()
    ]);
    
    console.error(`SUCCESS: API calls completed:`);
    console.error(`- AAPL price: $${price.price}`);
    console.error(`- Historical data: ${Object.keys(history.prices).length} days`);
    console.error(`- Treasury rate: ${(treasury.rate * 100).toFixed(2)}%\n`);
  } catch (error) {
    console.error(`ERROR: API calls failed: ${error.message}\n`);
  }
  
  // Test 3: Cache Status After Population
  console.error('Test 3: Cache Status After Population');
  try {
    const populatedStatus = await getCacheStatus();
    console.error('SUCCESS: Populated cache status retrieved');
    console.error('Sample output:');
    console.error(populatedStatus.content[0].text.substring(0, 400) + '...\n');
  } catch (error) {
    console.error(`ERROR: Populated cache status failed: ${error.message}\n`);
  }
  
  // Test 4: Cache Performance Test
  console.error('Test 4: Cache Performance Test (3 cycles)');
  try {
    const performanceTest = await testCache({
      symbol: 'AAPL',
      test_cycles: 3,
      clear_cache_first: false
    });
    
    console.error('SUCCESS: Cache performance test completed');
    console.error('Sample output:');
    console.error(performanceTest.content[0].text.substring(0, 600) + '...\n');
  } catch (error) {
    console.error(`ERROR: Cache performance test failed: ${error.message}\n`);
  }
  
  // Test 5: Cache Performance with Cold Start
  console.error('Test 5: Cache Performance Test (Cold Start)');
  try {
    const coldStartTest = await testCache({
      symbol: 'TSLA',
      test_cycles: 2,
      clear_cache_first: true
    });
    
    console.error('SUCCESS: Cold start cache test completed');
    console.error('Sample output:');
    console.error(coldStartTest.content[0].text.substring(0, 500) + '...\n');
  } catch (error) {
    console.error(`ERROR: Cold start cache test failed: ${error.message}\n`);
  }
  
  // Test 6: Cache Hit/Miss Statistics
  console.error('Test 6: Cache Hit/Miss Analysis');
  try {
    const stats = dataCache.getStats();
    console.error(`SUCCESS: Cache statistics retrieved:`);
    console.error(`- Total entries: ${stats.totalEntries}`);
    console.error(`- Active entries: ${stats.activeEntries}`);
    console.error(`- Expired entries: ${stats.expiredEntries}`);
    console.error(`- Cache hits: ${stats.hitCount}`);
    console.error(`- Cache misses: ${stats.missCount}`);
    console.error(`- Hit ratio: ${stats.hitRatio}%\n`);
  } catch (error) {
    console.error(`ERROR: Cache statistics failed: ${error.message}\n`);
  }
  
  // Test 7: Multiple Symbol Cache Test
  console.error('Test 7: Multiple Symbol Cache Test');
  try {
    const symbols = ['MSFT', 'GOOGL'];
    console.error(`Testing cache with symbols: ${symbols.join(', ')}`);
    
    for (const symbol of symbols) {
      const start = Date.now();
      const price = await marketDataService.getCurrentPrice(symbol);
      const time = Date.now() - start;
      console.error(`- ${symbol}: $${price.price} (${time}ms)`);
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.error('SUCCESS: Multiple symbol cache test completed\n');
  } catch (error) {
    console.error(`ERROR: Multiple symbol cache test failed: ${error.message}\n`);
  }
  
  // Test 8: Final Cache Status Summary
  console.error('Test 8: Final Cache Status Summary');
  try {
    const finalStatus = await getCacheStatus();
    console.error('SUCCESS: Final cache status retrieved');
    console.error('Final cache summary:');
    
    // Extract key metrics from the report
    const report = finalStatus.content[0].text;
    const activeMatch = report.match(/Active Cache Entries\*\*: (\d+)/);
    const memoryMatch = report.match(/Memory Usage\*\*: ([\d.]+) KB/);
    const hitRatioMatch = report.match(/Cache hit ratio: (\d+)%/);
    
    if (activeMatch) console.error(`- Active entries: ${activeMatch[1]}`);
    if (memoryMatch) console.error(`- Memory usage: ${memoryMatch[1]} KB`);
    if (hitRatioMatch) console.error(`- Hit ratio: ${hitRatioMatch[1]}%`);
    
    console.error('');
  } catch (error) {
    console.error(`ERROR: Final cache status failed: ${error.message}\n`);
  }
  
  console.error('Cache Testing Complete!\n');
  
  // Summary of cache capabilities
  console.error('Cache System Capabilities Summary:');
  console.error('\n**Cache Monitoring:**');
  console.error('- Real-time cache status and performance metrics');
  console.error('- Hit/miss ratio tracking with timing analysis');
  console.error('- Memory usage monitoring and cache entry details');
  console.error('- API rate limit integration and efficiency tracking');
  
  console.error('\n**Cache Performance Testing:**');
  console.error('- Multi-cycle performance comparison testing');
  console.error('- Cold start vs warm cache benchmarking');
  console.error('- Cross-symbol cache efficiency validation');
  console.error('- Automated cache effectiveness analysis');
  
  console.error('\n**Cache Optimization:**');
  console.error('- Intelligent TTL settings (5min prices, 1hr volatility, 24hr rates)');
  console.error('- Automatic cache cleanup and memory management');
  console.error('- Rate limit awareness and API call optimization');
  console.error('- Performance recommendations and health monitoring');
  
  console.error('\n**MCP Integration:**');
  console.error('- Native cache_status tool for Claude Desktop');
  console.error('- Interactive test_cache tool with configurable parameters');
  console.error('- Real-time monitoring during financial analysis workflows');
  console.error('- Seamless integration with all existing financial tools');
  
  console.error('\n**Example Usage in Claude Desktop:**');
  console.error('- "Show me the current cache status"');
  console.error('- "Test cache performance for Tesla with 5 cycles"');
  console.error('- "Clear cache and run a cold start performance test"');
  console.error('- "What\'s the cache hit ratio for my recent analyses?"');
}

// Run cache tests
runCacheTests().catch(console.error);