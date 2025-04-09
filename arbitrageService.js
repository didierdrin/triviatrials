import { firestore } from "./firebaseConfig.js";

// Cache for arbitrage data
let arbitrageCache = {
  data: [],
  lastUpdated: null
};

// Function to parse odds from string to number
function parseOdds(oddsStr) {
  if (!oddsStr || oddsStr === 'N/A') return null;
  
  // Remove any + signs and convert to number
  const cleaned = oddsStr.replace('+', '');
  const num = parseFloat(cleaned);
  
  // Handle American odds format
  if (oddsStr.startsWith('+')) {
    // Positive American odds: +100 -> 2.00
    return 1 + (num / 100);
  } else if (cleaned !== oddsStr && num > 100) {
    // Positive odds without + sign: "150" -> 2.50
    return 1 + (num / 100);
  } else if (num > 1) {
    // Already in decimal format
    return num;
  } else if (num < 1 && num > 0) {
    // Negative American odds: "1.5" -> 1.67 (100/150 + 1)
    return (1 / num) + 1;
  }
  
  return null;
}

// Function to calculate arbitrage opportunities
async function calculateArbitrageOpportunities() {
  try {
    console.log("Calculating arbitrage opportunities from Firestore...");
    
    // Get all betting odds from Firestore
    const snapshot = await firestore.collection('betting_odds')
      .orderBy('timestamp', 'desc')
      .limit(100) // Limit to most recent 100 matches
      .get();
    
    const allOdds = snapshot.docs.map(doc => doc.data());
    const arbitrageOpportunities = [];
    
    // Analyze each match for arbitrage
    for (const odds of allOdds) {
      try {
        // Parse and validate odds
        const homeDecimal = parseOdds(odds.home_odds);
        const awayDecimal = parseOdds(odds.away_odds);
        const drawDecimal = odds.draw_odds !== 'N/A' ? parseOdds(odds.draw_odds) : null;
        
        if (!homeDecimal || !awayDecimal) continue;
        
        // Calculate implied probabilities
        const homeProb = 1 / homeDecimal;
        const awayProb = 1 / awayDecimal;
        const drawProb = drawDecimal ? (1 / drawDecimal) : 0;
        
        // Total implied probability (2-way or 3-way)
        const totalProb = homeProb + awayProb + drawProb;
        
        // Check for arbitrage opportunity (total implied probability < 1)
        if (totalProb < 1) {
          const arbitrage = {
            id: `${odds.teams}-${odds.date}`,
            teams: odds.teams,
            date: odds.date,
            sport: odds.sport,
            home_odds: odds.home_odds,
            away_odds: odds.away_odds,
            draw_odds: odds.draw_odds || 'N/A',
            scrape_time: odds.scrape_time,
            total_implied_prob: totalProb.toFixed(4),
            arbitrage_percentage: ((1 - totalProb) * 100).toFixed(2),
            return_percentage: ((1/totalProb - 1) * 100).toFixed(2)
          };
          
          // Calculate optimal stakes for $100 total bet
          const totalBet = 100;
          arbitrage.home_stake = (totalBet * homeProb / totalProb).toFixed(2);
          arbitrage.away_stake = (totalBet * awayProb / totalProb).toFixed(2);
          
          if (drawDecimal) {
            arbitrage.draw_stake = (totalBet * drawProb / totalProb).toFixed(2);
          }
          
          arbitrage.guaranteed_profit = (totalBet * (1/totalProb - 1)).toFixed(2);
          arbitrageOpportunities.push(arbitrage);
        }
      } catch (e) {
        console.error(`Error processing match ${odds.teams}:`, e);
      }
    }
    
    console.log(`Found ${arbitrageOpportunities.length} arbitrage opportunities`);
    return arbitrageOpportunities;
  } catch (error) {
    console.error("Error calculating arbitrage:", error);
    throw error;
  }
}

// Function to format arbitrage opportunities for display
function formatArbitrageMessage(arbitrageData) {
  if (!arbitrageData || arbitrageData.length === 0) {
    return "🔍 No arbitrage betting opportunities found at the moment.\n\n" +
           "This could mean:\n" +
           "1. No current matches have profitable arbitrage\n" +
           "2. The odds are too close to create guaranteed profit\n" +
           "3. We're currently updating our data\n\n" +
           "Check back later or try 'bet update' to refresh.";
  }
  
  let message = "*🔍 BETTING ARBITRAGE OPPORTUNITIES*\n\n";
  
  // Sort by return percentage (descending)
  const sortedData = [...arbitrageData].sort((a, b) => 
    parseFloat(b.return_percentage) - parseFloat(a.return_percentage)
  );
  
  // Take top 5 opportunities
  const topOpportunities = sortedData.slice(0, 5);
  
  topOpportunities.forEach((opportunity, index) => {
    message += `*${index + 1}. ${opportunity.teams}*\n`;
    message += `📅 ${opportunity.date} | ${opportunity.sport}\n`;
    message += `⚽ Odds: H ${opportunity.home_odds} | A ${opportunity.away_odds}`;
    if (opportunity.draw_odds !== 'N/A') {
      message += ` | D ${opportunity.draw_odds}`;
    }
    message += `\n💰 Optimal Stakes (for $100 total):\n`;
    message += `   - Home: $${opportunity.home_stake}\n`;
    message += `   - Away: $${opportunity.away_stake}\n`;
    if (opportunity.draw_stake) {
      message += `   - Draw: $${opportunity.draw_stake}\n`;
    }
    message += `✅ Guaranteed Profit: $${opportunity.guaranteed_profit}\n`;
    message += `📈 Return Percentage: ${opportunity.return_percentage}%\n\n`;
  });
  
  message += `_Updated: ${arbitrageCache.lastUpdated?.toLocaleString() || "Never"}_\n`;
  message += "Type 'bet update' to refresh the data.";
  
  return message;
}

// Main function to update arbitrage data
async function updateArbitrageData() {
  try {
    console.log("Starting arbitrage data update process...");
    const arbitrageData = await calculateArbitrageOpportunities();
    
    arbitrageCache.data = arbitrageData;
    arbitrageCache.lastUpdated = new Date();
    
    console.log(`Arbitrage data updated successfully. Found ${arbitrageData.length} opportunities.`);
    return arbitrageData;
  } catch (error) {
    console.error("Error updating arbitrage data:", error);
    throw error;
  }
}

// Initialize the service
function initArbitrageService() {
  console.log("Initializing arbitrage service...");
  
  // Initial update
  updateArbitrageData()
    .then(() => console.log("Initial arbitrage data update completed"))
    .catch(err => console.error("Error in initial arbitrage update:", err));
  
  // Schedule updates every 3 hours
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  setInterval(() => {
    console.log("Scheduled arbitrage data update triggered");
    updateArbitrageData()
      .then(() => console.log("Scheduled arbitrage data update completed"))
      .catch(err => console.error("Error in scheduled arbitrage update:", err));
  }, THREE_HOURS);
}

// Function to get current arbitrage data
function getArbitrageData() {
  // If data is older than 1 hour, trigger an update
  const ONE_HOUR = 60 * 60 * 1000;
  if (!arbitrageCache.lastUpdated || (new Date() - arbitrageCache.lastUpdated > ONE_HOUR)) {
    console.log("Arbitrage data is stale, triggering update...");
    updateArbitrageData()
      .then(() => console.log("Stale data refresh completed"))
      .catch(err => console.error("Error refreshing stale data:", err));
  }
  
  return arbitrageCache.data;
}

export { 
  initArbitrageService, 
  getArbitrageData, 
  updateArbitrageData, 
  formatArbitrageMessage 
};
