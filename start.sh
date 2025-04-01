#!/bin/bash
# Start script for running the application
set -e

echo "🚀 Starting application..."

# Start the Node.js server
node app.js &
NODE_PID=$!

echo "📊 Node.js server started with PID: $NODE_PID"

# Give the server a moment to initialize
sleep 5

# Run the initial data scraping
echo "🕷️ Running initial web scraping..."
python3 extract_odds.py

# Set up cron job for periodic scraping (runs every 3 hours)
echo "⏰ Setting up scheduled tasks..."
(crontab -l 2>/dev/null; echo "0 */3 * * * cd $PWD && python3 extract_odds.py >> scraping.log 2>&1") | crontab -

echo "✅ Application started successfully!"

# Keep the script running (following the Node.js process)
wait $NODE_PID
