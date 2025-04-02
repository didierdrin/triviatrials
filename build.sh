#!/bin/bash
set -e

echo "🚀 Starting build process..."

# Create bin directory in home (Render allows writing here)
mkdir -p $HOME/bin

# Install Chrome in $HOME/bin
echo "🖥️ Installing Google Chrome..."
wget -q -O $HOME/bin/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
dpkg -x $HOME/bin/google-chrome.deb $HOME/bin/chrome
rm $HOME/bin/google-chrome.deb

# Find the Chrome binary location
export CHROME_BIN="$HOME/bin/chrome/opt/google/chrome/google-chrome"

# Install ChromeDriver in $HOME/bin
echo "🚗 Installing ChromeDriver..."
CHROMEDRIVER_VERSION=$(curl -sS chromedriver.storage.googleapis.com/LATEST_RELEASE)
wget -q -O $HOME/bin/chromedriver.zip "https://chromedriver.storage.googleapis.com/${CHROMEDRIVER_VERSION}/chromedriver_linux64.zip"
unzip -o $HOME/bin/chromedriver.zip -d $HOME/bin
chmod +x $HOME/bin/chromedriver
rm $HOME/bin/chromedriver.zip

export CHROMEDRIVER_BIN="$HOME/bin/chromedriver"

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
pip install selenium webdriver-manager pandas numpy

# Install Node.js dependencies
echo "🧶 Installing JS dependencies with Yarn..."
yarn install

echo "🎉 Build completed successfully!"
