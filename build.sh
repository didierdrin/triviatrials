#!/bin/bash
# Build script compatible with read-only filesystem environments like Render
set -e

echo "🚀 Starting build process..."

# Create directories we have write access to
mkdir -p $HOME/.chrome
mkdir -p $HOME/.chromedriver
mkdir -p $HOME/.cache/pip

# Use user-level installations instead of system-level
echo "🐍 Setting up Python environment..."
pip install --user selenium webdriver-manager pandas numpy

# Set environment variables to help ChromeDriver find Chrome
export CHROME_BIN=$HOME/.chrome/chrome
export CHROMEDRIVER_PATH=$HOME/.chromedriver/chromedriver

# Install Node.js dependencies with yarn
echo "🧶 Installing JS dependencies with Yarn..."
yarn install

# Update your Python script to use these environment variables
cat > chrome_config.py << EOL
# Configuration for Chrome/Selenium
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

def get_chrome_options():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--remote-debugging-port=9222")
    
    # Use browserless.io or similar service instead of local Chrome
    chrome_options.add_argument("--remote-debugging-address=0.0.0.0")
    
    return chrome_options

def get_chrome_service():
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager
    
    # Cache the ChromeDriver in our writable directory
    os.environ['WDM_CACHE_PATH'] = os.path.expanduser('~/.cache/webdriver')
    
    return Service(ChromeDriverManager().install())
EOL

# Create a modified version of extract_odds.py that uses puppeteer
cat > extract_odds_puppeteer.js << EOL
const puppeteer = require('puppeteer');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

async function scrapeOdds() {
  console.log("Starting odds scraping with Puppeteer...");
  
  // Create CSV header
  const header = ["Date", "Teams", "Sport", "Home Odds", "Draw Odds", "Away Odds"];
  fs.writeFileSync('betpawa_odds.csv', stringify([header]), 'utf8');
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const url = "https://www.betpawa.rw/events?marketId=1X2&categoryId=2";
    
    console.log(\`Loading page: \${url}\`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log("Page loaded, waiting for content...");
    // Wait for events to load
    await page.waitForTimeout(5000);
    
    // Extract events data
    const events = await page.evaluate(() => {
      const eventElements = document.querySelectorAll('.event, .prematch, .match-row, tr');
      console.log(\`Found \${eventElements.length} elements\`);
      
      return Array.from(eventElements).map(el => {
        const text = el.innerText;
        const lines = text.split('\\n').filter(line => line.trim());
        
        if (lines.length < 6) return null;
        
        return {
          date: lines[0],
          teams: \`\${lines[1]} vs \${lines[2]}\`,
          homeOdds: lines[lines.length - 6] || 'N/A',
          drawOdds: lines[lines.length - 4] || 'N/A',
          awayOdds: lines[lines.length - 2] || 'N/A'
        };
      }).filter(event => event !== null);
    });
    
    console.log(\`Extracted \${events.length} events\`);
    
    // Write results to CSV
    const records = events.map(event => [
      event.date,
      event.teams,
      "Football",
      event.homeOdds,
      event.drawOdds,
      event.awayOdds
    ]);
    
    if (records.length > 0) {
      fs.appendFileSync('betpawa_odds.csv', stringify(records), 'utf8');
      console.log(\`Added \${records.length} records to CSV\`);
    } else {
      console.log("No valid records found");
    }
    
  } catch (error) {
    console.error(\`An error occurred: \${error.message}\`);
    console.error(error.stack);
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
}

scrapeOdds().then(() => {
  console.log("Scraping completed. Data saved to betpawa_odds.csv");
}).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
EOL

# Create a shell script to run the application
cat > start.sh << EOL
#!/bin/bash
# Start script for running the application

echo "🚀 Starting application..."

# Run the JS-based scraper instead of Python
node extract_odds_puppeteer.js
node app.js
EOL

# Make the start script executable
chmod +x start.sh

echo "📝 Installing required Node.js packages..."
yarn add puppeteer csv-parse csv-stringify

echo "🎉 Build completed successfully!"
echo "🏃 Ready to start application"
