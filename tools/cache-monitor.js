import dataCache from '../utils/data-cache.js';
import alphaVantageClient from '../utils/alpha-vantage-client.js';
import marketDataService from '../services/market-data.js';

/**
 * Get comprehensive cache status and performance metrics
 */
export async function getCacheStatus() {
  try {
    // Get cache statistics
    const cacheStats = dataCache.getStats();
    
    // Get rate limit status
    const rateLimitStatus = alphaVantageClient.getRateLimitStatus();
    
    // Get all cache keys with their details
    const cacheEntries = [];
    const now = Date.now();
    
    for (const [key, expirationTime] of dataCache.ttls) {
      const isExpired = now > expirationTime;
      const timeToExpiry = isExpired ? 0 : Math.round((expirationTime - now) / 1000);
      const value = dataCache.cache.get(key);
      
      cacheEntries.push({
        key: key,
        isExpired: isExpired,
        timeToExpirySeconds: timeToExpiry,
        dataType: key.split(':')[2] || 'unknown',
        symbol: key.includes('market:') ? key.split(':')[1] : null,
        hasValue: value !== null && value !== undefined,
        valueSize: value ? JSON.stringify(value).length : 0
      });
    }
    
    // Sort by expiry time (soonest first)
    cacheEntries.sort((a, b) => a.timeToExpirySeconds - b.timeToExpirySeconds);
    
    // Calculate cache efficiency metrics
    const totalApiCalls = rateLimitStatus.callsThisMinute;
    const cacheHits = cacheStats.activeEntries;
    const estimatedApiCallsSaved = Math.max(0, cacheHits - totalApiCalls);
    
    // Memory usage estimate
    const totalMemoryBytes = cacheEntries.reduce((sum, entry) => sum + entry.valueSize, 0);
    const totalMemoryKB = Math.round(totalMemoryBytes / 1024 * 100) / 100;
    
    const report = `# Cache Status Report

## Cache Performance Overview
- **Active Cache Entries**: ${cacheStats.activeEntries}
- **Total Cache Entries**: ${cacheStats.totalEntries}
- **Expired Entries**: ${cacheStats.expiredEntries}
- **Memory Usage**: ${totalMemoryKB} KB
- **Estimated API Calls Saved**: ${estimatedApiCallsSaved}

## API Rate Limit Status
- **Calls This Minute**: ${rateLimitStatus.callsThisMinute}/5
- **Remaining Calls**: ${5 - rateLimitStatus.callsThisMinute}
- **Reset Time**: ${new Date(rateLimitStatus.windowResetTime).toLocaleTimeString()}
- **Rate Limited**: ${rateLimitStatus.isRateLimited ? 'ERROR: Yes' : 'SUCCESS: No'}

## Cache Entries Detail

${cacheEntries.length === 0 ? '*(No cache entries found)*' : 
  cacheEntries.map((entry, index) => {
    const status = entry.isExpired ? 'EXPIRED' : 'ACTIVE';
    const timeText = entry.isExpired ? 'Expired' : `${entry.timeToExpirySeconds}s left`;
    const sizeText = entry.valueSize > 0 ? `(${entry.valueSize} bytes)` : '(empty)';
    
    return `**${index + 1}. ${entry.key}**
- Status: ${status}
- Time to Expiry: ${timeText}
- Data Type: ${entry.dataType}
- Symbol: ${entry.symbol || 'N/A'}
- Size: ${sizeText}`;
  }).join('\n\n')
}

## Cache Efficiency Analysis

${cacheStats.activeEntries > 0 ? `
SUCCESS: **Cache is Working!**
- You have ${cacheStats.activeEntries} active cached entries
- This is saving approximately ${estimatedApiCallsSaved} API calls
- Cache hit ratio: ${cacheStats.activeEntries > 0 ? Math.round((cacheStats.activeEntries / (cacheStats.activeEntries + totalApiCalls)) * 100) : 0}%
` : `
WARNING: **Cache is Empty**
- No active cache entries found
- All API calls are hitting the live service
- Consider making some API calls to populate the cache
`}

## Recommendations

${rateLimitStatus.callsThisMinute >= 4 ? 'WARNING: **High API Usage** - You\'re close to the 5 calls/minute limit. Cache is crucial!' : ''}
${cacheStats.expiredEntries > 10 ? 'INFO: **Cache Cleanup Needed** - Consider running cache cleanup to free memory.' : ''}
${totalMemoryKB > 100 ? 'WARNING: **High Memory Usage** - Cache is using significant memory. Consider shorter TTL periods.' : ''}
${cacheStats.activeEntries === 0 ? 'INFO: **Populate Cache** - Make some API calls to see caching in action.' : ''}

*Report generated at: ${new Date().toLocaleString()}*
`;

    return {
      content: [
        {
          type: "text",
          text: report
        }
      ]
    };

  } catch (error) {
    return {
      content: [
        {
          type: "text", 
          text: `Error getting cache status: ${error.message}`
        }
      ]
    };
  }
}

/**
 * Test cache functionality with timing comparisons
 */
export async function testCache(args = {}) {
  const {
    symbol = 'AAPL',
    test_cycles = 3,
    clear_cache_first = false
  } = args;

  try {
    let report = `# Cache Performance Test

## Test Configuration
- **Symbol**: ${symbol}
- **Test Cycles**: ${test_cycles}
- **Clear Cache First**: ${clear_cache_first ? 'Yes' : 'No'}

## Test Results

`;

    // Clear cache if requested
    if (clear_cache_first) {
      dataCache.clear();
      report += `SUCCESS: Cache cleared before testing\n\n`;
    }

    const results = [];

    for (let cycle = 1; cycle <= test_cycles; cycle++) {
      report += `### Cycle ${cycle}\n\n`;
      
      // Test current price fetching
      const priceStart = Date.now();
      const priceResult = await marketDataService.getCurrentPrice(symbol);
      const priceTime = Date.now() - priceStart;
      
      // Test historical data fetching  
      const historyStart = Date.now();
      const historyResult = await marketDataService.getHistoricalPrices(symbol);
      const historyTime = Date.now() - historyStart;
      
      // Test Treasury rate fetching
      const treasuryStart = Date.now();
      const treasuryResult = await marketDataService.getRiskFreeRate();
      const treasuryTime = Date.now() - treasuryStart;
      
      const cycleResults = {
        cycle: cycle,
        priceTime: priceTime,
        historyTime: historyTime,
        treasuryTime: treasuryTime,
        totalTime: priceTime + historyTime + treasuryTime
      };
      
      results.push(cycleResults);
      
      report += `- **Current Price**: ${priceTime}ms (${priceResult.price})\n`;
      report += `- **Historical Data**: ${historyTime}ms (${Object.keys(historyResult.prices).length} days)\n`;
      report += `- **Treasury Rate**: ${treasuryTime}ms (${(treasuryResult.rate * 100).toFixed(2)}%)\n`;
      report += `- **Total Time**: ${cycleResults.totalTime}ms\n\n`;
      
      // Wait between cycles to see cache effects
      if (cycle < test_cycles) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Calculate performance improvements
    const firstCycle = results[0];
    const lastCycle = results[results.length - 1];
    
    const priceImprovement = Math.round(((firstCycle.priceTime - lastCycle.priceTime) / firstCycle.priceTime) * 100);
    const historyImprovement = Math.round(((firstCycle.historyTime - lastCycle.historyTime) / firstCycle.historyTime) * 100);
    const treasuryImprovement = Math.round(((firstCycle.treasuryTime - lastCycle.treasuryTime) / firstCycle.treasuryTime) * 100);
    const totalImprovement = Math.round(((firstCycle.totalTime - lastCycle.totalTime) / firstCycle.totalTime) * 100);

    report += `## Performance Analysis

### Speed Improvements (First vs Last Cycle)
- **Current Price**: ${priceImprovement}% faster ${priceImprovement > 50 ? '[EXCELLENT]' : priceImprovement > 0 ? '[GOOD]' : '[POOR]'}
- **Historical Data**: ${historyImprovement}% faster ${historyImprovement > 50 ? '[EXCELLENT]' : historyImprovement > 0 ? '[GOOD]' : '[POOR]'}
- **Treasury Rate**: ${treasuryImprovement}% faster ${treasuryImprovement > 50 ? '[EXCELLENT]' : treasuryImprovement > 0 ? '[GOOD]' : '[POOR]'}
- **Overall**: ${totalImprovement}% faster ${totalImprovement > 50 ? '[EXCELLENT]' : totalImprovement > 0 ? '[GOOD]' : '[POOR]'}

### Cache Effectiveness
${totalImprovement > 80 ? '**Excellent** - Cache is providing major performance benefits' : 
  totalImprovement > 50 ? '**Good** - Cache is working well' :
  totalImprovement > 20 ? '**Moderate** - Cache has some benefit but could be improved' :
  '**Poor** - Cache may not be working effectively'}

### Final Cache Status
`;

    // Get final cache status
    const finalStats = dataCache.getStats();
    report += `- Active Entries: ${finalStats.activeEntries}\n`;
    report += `- Total Entries: ${finalStats.totalEntries}\n`;
    report += `- Expired Entries: ${finalStats.expiredEntries}\n`;

    report += `\n*Test completed at: ${new Date().toLocaleString()}*`;

    return {
      content: [
        {
          type: "text",
          text: report
        }
      ]
    };

  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error testing cache: ${error.message}`
        }
      ]
    };
  }
}