// arbitrageService.js
import axios from 'axios';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for arbitrage data
let arbitrageCache = {
  data: [],
  lastUpdated: null
};

// Function to extract odds data (simulating Python script execution)
async function extractOddsData() {
  return new Promise((resolve, reject) => {
    console.log("Starting odds extraction process...");
    
    // Execute the Python script to scrape odds
    exec('python3 extract_odds.py', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing odds extraction script: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Script stderr: ${stderr}`);
      }
      console.log(`Script stdout: ${stdout}`);
      resolve("Odds data extracted successfully");
    });
  });
}

// Function to analyze for arbitrage opportunities (simulating Python script execution)
async function analyzeArbitrageOpportunities() {
  return new Promise((resolve, reject) => {
    console.log("Starting arbitrage analysis...");
    
    // Execute the Python script to analyze arbitrage
    exec('python3 analyze_arbitrage.py', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing arbitrage analysis script: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Script stderr: ${stderr}`);
      }
      console.log(`Script stdout: ${stdout}`);
      resolve("Arbitrage analysis completed successfully");
    });
  });
}

// Function to read arbitrage data from CSV
function readArbitrageData() {
  try {
    const csvFilePath = path.join(__dirname, 'betting_arbitrage.csv');
    if (!fs.existsSync(csvFilePath)) {
      console.log("Arbitrage CSV file not found");
      return [];
    }
    
    const csvData = fs.readFileSync(csvFilePath, 'utf8');
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const obj = {};
      const currentLine = lines[i].split(',');
      
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentLine[j];
      }
      results.push(obj);
    }
    
    console.log(`Read ${results.length} arbitrage opportunities from CSV`);
    return results;
  } catch (error) {
    console.error("Error reading arbitrage data:", error);
    return [];
  }
}

// Main function to update arbitrage data (runs every 2 hours)
async function updateArbitrageData() {
  try {
    console.log("Starting arbitrage data update process...");
    await extractOddsData();
    await analyzeArbitrageOpportunities();
    
    const arbitrageData = readArbitrageData();
    arbitrageCache.data = arbitrageData;
    arbitrageCache.lastUpdated = new Date();
    
    console.log(`Arbitrage data updated successfully. Found ${arbitrageData.length} opportunities.`);
    return arbitrageData;
  } catch (error) {
    console.error("Error updating arbitrage data:", error);
    throw error;
  }
}

// Initialize the data update process and schedule regular updates
function initArbitrageService() {
  console.log("Initializing arbitrage service...");
  
  // Initial update
  updateArbitrageData()
    .then(() => console.log("Initial arbitrage data update completed"))
    .catch(err => console.error("Error in initial arbitrage update:", err));
  
  // Schedule updates every 2 hours
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  setInterval(() => {
    console.log("Scheduled arbitrage data update triggered");
    updateArbitrageData()
      .then(() => console.log("Scheduled arbitrage data update completed"))
      .catch(err => console.error("Error in scheduled arbitrage update:", err));
  }, TWO_HOURS);
}

// Function to get current arbitrage data
function getArbitrageData() {
  // If data is older than 2 hours, trigger an update
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  if (!arbitrageCache.lastUpdated || (new Date() - arbitrageCache.lastUpdated > TWO_HOURS)) {
    console.log("Arbitrage data is stale, triggering update...");
    updateArbitrageData()
      .then(() => console.log("Stale data refresh completed"))
      .catch(err => console.error("Error refreshing stale data:", err));
  }
  
  return arbitrageCache.data;
}

// Function to format arbitrage opportunities for WhatsApp message
function formatArbitrageMessage(arbitrageData) {
  if (!arbitrageData || arbitrageData.length === 0) {
    return "No arbitrage betting opportunities found at the moment. Check back later.";
  }
  
  let message = "*🔍 BETTING ARBITRAGE OPPORTUNITIES*\n\n";
  
  // Sort by profit percentage (descending)
  const sortedData = [...arbitrageData].sort((a, b) => 
    parseFloat(b['Profit Percentage']) - parseFloat(a['Profit Percentage'])
  );
  
  // Take top 5 opportunities or all if less than 5
  const topOpportunities = sortedData.slice(0, Math.min(5, sortedData.length));
  
  topOpportunities.forEach((game, index) => {
    message += `*${index + 1}. ${game.Teams}*\n`;
    message += `📅 Date: ${game.Date}\n`;
    message += `📊 Odds: Home ${game.Home_Odds}, Away ${game.Away_Odds}\n`;
    message += `💰 Optimal Stakes: Home $${game.Home_Stake}, Away $${game.Away_Stake}\n`;
    message += `✅ Guaranteed Profit: $${game.Profit} (${game.Profit_Percentage}%)\n\n`;
  });
  
  message += "_Updated: " + (arbitrageCache.lastUpdated ? arbitrageCache.lastUpdated.toLocaleString() : "Never") + "_\n";
  message += "Type 'bet update' to force refresh the data.";
  
  return message;
}

export { 
  initArbitrageService, 
  getArbitrageData, 
  updateArbitrageData, 
  formatArbitrageMessage 
};
