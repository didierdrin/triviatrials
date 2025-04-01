#!/bin/bash
# Build script for setting up Python environment with Chrome and JS dependencies
set -e

echo "🚀 Starting build process..."

# Update package lists
echo "📦 Updating package lists..."
apt-get update

# Install required dependencies for Chrome
echo "🔧 Installing Chrome dependencies..."
apt-get install -y wget gnupg curl build-essential unzip

# Add Google Chrome repository and install Chrome
echo "🌐 Installing Google Chrome..."
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list
apt-get update
apt-get install -y google-chrome-stable

# Verify Chrome installation
echo "✅ Verifying Chrome installation..."
google-chrome --version

# Install Python dependencies
echo "🐍 Setting up Python environment..."
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    # Install minimum required packages if no requirements.txt
    pip install selenium webdriver-manager pandas numpy
fi

# Install Node.js and yarn if not already installed
if ! command -v node &> /dev/null; then
    echo "📊 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
    apt-get install -y nodejs
fi

if ! command -v yarn &> /dev/null; then
    echo "🧶 Installing Yarn..."
    npm install -g yarn
fi

# Install JS dependencies
echo "📚 Installing JS dependencies with Yarn..."
yarn install

# Make sure scripts are executable
chmod +x start.sh

echo "🎉 Build completed successfully!"
echo "🏃 Starting application..."

# Start the application
./start.sh
