import { firestore } from "./firebaseConfig.js";

// Cache for arbitrage data
let arbitrageCache = {
  data: [],
  lastUpdated: null
};

// Function to calculate arbitrage opportunities
async function calculateArbitrageOpportunities() {
  try {
    console.log("Calculating arbitrage opportunities from Firestore...");
    
    // Get all betting odds from Firestore
    const snapshot = await firestore.collection('betting_odds').get();
    const allOdds = snapshot.docs.map(doc => doc.data());
    
    const arbitrageOpportunities = [];
    
    // Analyze each match for arbitrage
    for (const odds of allOdds) {
      try {
        // Convert odds to implied probabilities
        const homeDecimal = americanToDecimal(odds.home_odds);
        const awayDecimal = americanToDecimal(odds.away_odds);
        const drawDecimal = odds.draw_odds ? americanToDecimal(odds.draw_odds) : null;
        
        // Calculate total implied probability
        let totalImpliedProbability = 1/homeDecimal + 1/awayDecimal;
        if (drawDecimal) {
          totalImpliedProbability += 1/drawDecimal;
        }
        
        // Check for arbitrage opportunity (total implied probability < 1)
        if (totalImpliedProbability < 1) {
          const arbitrage = {
            id: `${odds.teams}-${odds.date}`,
            teams: odds.teams,
            date: odds.date,
            sport: odds.sport,
            home_odds: odds.home_odds,
            away_odds: odds.away_odds,
            draw_odds: odds.draw_odds || 'N/A',
            scrape_time: odds.scrape_time,
            total_implied_prob: totalImpliedProbability,
            arbitrage_percentage: ((1 - totalImpliedProbability) * 100).toFixed(2),
            return_percentage: ((1/totalImpliedProbability - 1) * 100).toFixed(2)
          };
          
          // Calculate optimal stakes for $100 total bet
          const totalBet = 100;
          arbitrage.home_stake = (totalBet / (homeDecimal * totalImpliedProbability)).toFixed(2);
          arbitrage.away_stake = (totalBet / (awayDecimal * totalImpliedProbability)).toFixed(2);
          if (drawDecimal) {
            arbitrage.draw_stake = (totalBet / (drawDecimal * totalImpliedProbability)).toFixed(2);
          }
          arbitrage.guaranteed_profit = (totalBet * (1/totalImpliedProbability - 1)).toFixed(2);
          
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

// Convert American odds to decimal odds
function americanToDecimal(americanOdds) {
  if (!americanOdds) return 0;
  
  // Remove + if present
  const oddsStr = americanOdds.replace('+', '');
  const oddsNum = parseFloat(oddsStr);
  
  if (isNaN(oddsNum)) return 0;
  
  if (americanOdds.startsWith('+')) {
    // Positive odds
    return 1 + (oddsNum / 100);
  } else {
    // Negative odds (or already decimal)
    if (oddsNum > 100) {
      // This is positive odds without + sign
      return 1 + (oddsNum / 100);
    } else if (oddsNum >= 1) {
      // Already in decimal format
      return oddsNum;
    } else {
      // Negative odds
      return 1 + (100 / Math.abs(oddsNum));
    }
  }
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

// Function to format arbitrage opportunities for display
function formatArbitrageMessage(arbitrageData) {
  if (!arbitrageData || arbitrageData.length === 0) {
    return "No arbitrage betting opportunities found at the moment. Check back later.";
  }
  
  let message = "*🔍 BETTING ARBITRAGE OPPORTUNITIES*\n\n";
  
  // Sort by return percentage (descending)
  const sortedData = [...arbitrageData].sort((a, b) => 
    parseFloat(b.return_percentage) - parseFloat(a.return_percentage)
  );
  
  // Take top 5 opportunities or all if less than 5
  const topOpportunities = sortedData.slice(0, Math.min(5, sortedData.length));
  
  topOpportunities.forEach((opportunity, index) => {
    message += `*${index + 1}. ${opportunity.teams}*\n`;
    message += `📅 ${opportunity.date} | ${opportunity.sport}\n`;
    message += `⚽ Odds: H ${opportunity.home_odds} | D ${opportunity.draw_odds} | A ${opportunity.away_odds}\n`;
    message += `💰 Optimal Stakes (for $100 total):\n`;
    message += `   - Home: $${opportunity.home_stake}\n`;
    message += `   - Away: $${opportunity.away_stake}\n`;
    if (opportunity.draw_stake) {
      message += `   - Draw: $${opportunity.draw_stake}\n`;
    }
    message += `✅ Guaranteed Profit: $${opportunity.guaranteed_profit}\n`;
    message += `📈 Return Percentage: ${opportunity.return_percentage}%\n\n`;
  });
  
  message += `_Updated: ${arbitrageCache.lastUpdated?.toLocaleString() || "Never"}_\n`;
  message += "Type 'update' to refresh the data.";
  
  return message;
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
  // If data is older than 3 hours, trigger an update
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  if (!arbitrageCache.lastUpdated || (new Date() - arbitrageCache.lastUpdated > THREE_HOURS)) {
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
