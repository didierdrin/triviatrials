#!/bin/bash
# Build script for Render with Poetry and Node.js
set -e

echo "🚀 Starting build process..."

# Install Python dependencies using pip (without --user flag)
echo "🐍 Installing Python dependencies..."
pip install selenium webdriver-manager pandas numpy

# Install Node.js dependencies
echo "🧶 Installing JS dependencies with Yarn..."
yarn install

# Add puppeteer for web scraping (more reliable than Selenium on Render)
echo "🕸️ Adding Puppeteer for web scraping..."
yarn add puppeteer csv-parse csv-stringify

# Create a JS-based scraper that doesn't require Chrome installation
echo "📝 Creating Puppeteer-based scraper..."
cat > scrape_odds.js << 'EOL'
const puppeteer = require('puppeteer');
const fs = require('fs');
const { stringify } = require('csv-stringify/sync');

async function scrapeOdds() {
  console.log("Starting odds scraping with Puppeteer...");
  
  // Create CSV header
  const header = ["Date", "Teams", "Sport", "Home Odds", "Draw Odds", "Away Odds"];
  fs.writeFileSync('betpawa_odds.csv', stringify([header]), 'utf8');
  
  // Launch browser with Puppeteer's bundled Chromium
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    const url = "https://www.betpawa.rw/events?marketId=1X2&categoryId=2";
    
    console.log(`Loading page: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    
    // Wait for content to load
    console.log("Page loaded, waiting for events to appear...");
    await page.waitForTimeout(10000);
    
    // Extract events data
    const events = await page.evaluate(() => {
      const eventElements = Array.from(document.querySelectorAll('.event, .prematch, .match-row, tr'));
      console.log(`Found ${eventElements.length} potential event elements`);
      
      return eventElements
        .map(el => {
          const text = el.innerText.trim();
          if (!text) return null;
          
          console.log(`Processing element with text: ${text.substring(0, 50)}...`);
          const lines = text.split('\n').filter(line => line.trim());
          
          if (lines.length < 6) {
            console.log(`Not enough lines (${lines.length}), skipping`);
            return null;
          }
          
          return {
            date: lines[0] || 'N/A',
            teams: `${lines[1] || 'Unknown'} vs ${lines[2] || 'Unknown'}`,
            homeOdds: lines[lines.length - 6] || 'N/A',
            drawOdds: lines[lines.length - 4] || 'N/A',
            awayOdds: lines[lines.length - 2] || 'N/A'
          };
        })
        .filter(event => event !== null);
    });
    
    console.log(`Extracted ${events.length} valid events`);
    
    // Write results to CSV
    if (events.length > 0) {
      const records = events.map(event => [
        event.date,
        event.teams,
        "Football",
        event.homeOdds,
        event.drawOdds,
        event.awayOdds
      ]);
      
      fs.appendFileSync('betpawa_odds.csv', stringify(records), 'utf8');
      console.log(`Added ${records.length} records to CSV file`);
      
      // Debug - show some of the data
      console.log("Sample data:");
      console.log(records.slice(0, 3));
    } else {
      console.log("No valid records found");
    }
  } catch (error) {
    console.error(`Error during scraping: ${error.message}`);
    console.error(error.stack);
  } finally {
    await browser.close();
    console.log("Browser closed");
  }
  
  console.log("Scraping completed. Data saved to betpawa_odds.csv");
}

// Execute the function
scrapeOdds().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
EOL

# Create a start script that will run both the scraper and server
echo "📄 Creating start script..."
cat > start.sh << 'EOL'
#!/bin/bash
# Start script for the application

echo "🚀 Starting application..."

# Run the JS-based scraper
echo "🕷️ Running web scraper..."
node scrape_odds.js

# Once scraping is complete, run the analysis
echo "📊 Analyzing odds data..."
python3 analyze_arbitrage.py

# Start the server
echo "🌐 Starting web server..."
node app.js
EOL

# Make the start script executable
chmod +x start.sh

echo "🎉 Build completed successfully!"
