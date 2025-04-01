# extract_odds.py
import csv
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

def scrape_betpawa_odds(url, csv_file="betpawa_odds.csv"):
    """
    Scrape sports betting odds from BetPawa Rwanda website using Selenium with Chrome.
    Extracts date, team names, sport type, and odds.
    """
    with open(csv_file, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["Date", "Teams", "Sport", "Home Odds", "Draw Odds", "Away Odds"])
    
    # Set up Chrome options
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # Run in headless mode
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    # Use WebDriverManager to handle Chrome driver installation
    try:
        print("Setting up Chrome driver with WebDriverManager")
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
    except Exception as e:
        print(f"Error initializing Chrome driver: {str(e)}")
        raise
    
    try:
        print(f"Loading page: {url}")
        driver.get(url)
        wait = WebDriverWait(driver, 30)
        print(f"Page title: {driver.title}")
        
        # Wait for dynamic content to load
        time.sleep(10)
        print("Extra wait time completed")
        
        # Try different selectors for events
        events = driver.find_elements(By.CSS_SELECTOR, ".event, .prematch, .match-row, tr")
        print(f"Found {len(events)} potential event elements")
        
        records_count = 0
        
        for match in events:
            date_str = "N/A"
            teams = "N/A"
            home_odds = "N/A"
            draw_odds = "N/A"
            away_odds = "N/A"
            
            try:
                match_text = match.text.strip()
                if match_text:
                    print(f"Match text: {match_text[:100]}...")  # Log first 100 chars for debugging
                    lines = match_text.split("\n")
        
                    if len(lines) >= 6:  # Ensure there are enough lines
                        date_str = lines[0]  # First line is the date
                        teams = f"{lines[1]} vs {lines[2]}"  # Next two lines are team names
            
                        # Extract odds assuming they appear after the teams
                        home_odds = lines[-6]  # Third last line
                        draw_odds = lines[-4]  # Second last line
                        away_odds = lines[-2]  # Last line
                    else:
                        home_odds, draw_odds, away_odds = "N/A", "N/A", "N/A"
            except Exception as e:
                print(f"Error extracting match details: {e}")

            # Print odds before writing
            print(f"Extracted odds: Home - {home_odds}, Draw - {draw_odds}, Away - {away_odds}")

            # Ensure odds are non-empty before writing
            if home_odds and draw_odds and away_odds:
                with open(csv_file, mode="a", newline="", encoding="utf-8") as file:
                    writer = csv.writer(file)
                    writer.writerow([date_str, teams, "Football", home_odds, draw_odds, away_odds])
                print(f"✅ Added to CSV: {teams} on {date_str} with odds {home_odds}, {draw_odds}, {away_odds}")
            else:
                print(f"⚠️ Skipping writing to CSV due to missing odds. Extracted: {home_odds}, {draw_odds}, {away_odds}")

            records_count += 1
            print(f"Added to CSV ({records_count}): {teams} on {date_str} with odds {home_odds}, {draw_odds}, {away_odds}")
    
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        raise
    finally:
        driver.quit()
        print("Browser closed.")
        
if __name__ == "__main__":
    url = "https://www.betpawa.rw/events?marketId=1X2&categoryId=2"  # similar to https://www.betpawa.rw/events
    scrape_betpawa_odds(url)
    print("Scraping completed. Data saved to betpawa_odds.csv")

# analyze_arbitrage.py
import pandas as pd
import numpy as np

def check_two_way_arbitrage(home_odds, away_odds):
    """Check if there's an arbitrage opportunity between home and away teams only."""
    # Calculate the implied probabilities
    home_prob = 1 / home_odds
    away_prob = 1 / away_odds
    
    # Sum of probabilities (excluding draw)
    total_prob = home_prob + away_prob
    
    # If total probability is less than 1, it's an arbitrage opportunity
    return total_prob < 1, total_prob

def calculate_two_way_stakes(total_stake, home_odds, away_odds):
    """Calculate optimal stakes for home and away outcomes to ensure equal profit."""
    # Calculate implied probabilities
    home_prob = 1 / home_odds
    away_prob = 1 / away_odds
    total_prob = home_prob + away_prob
    
    # Calculate stakes for equal profit regardless of outcome
    home_stake = (total_stake * home_prob) / total_prob
    away_stake = (total_stake * away_prob) / total_prob
    
    # Calculate guaranteed return
    guaranteed_return = home_odds * home_stake  # Should be same as away_odds * away_stake
    profit = guaranteed_return - total_stake
    profit_percentage = (profit / total_stake) * 100
    
    return home_stake, away_stake, guaranteed_return, profit, profit_percentage

def main():
    # Load the betting odds CSV
    try:
        df = pd.read_csv('betpawa_odds.csv')
        print(f"Successfully loaded CSV file with {len(df)} entries.")
    except FileNotFoundError:
        print("Error: betpawa_odds.csv file not found.")
        return
    
    # Create empty list to store arbitrage opportunities
    arbitrage_games = []
    
    # Standard investment amount for calculations
    total_stake = 100
    
    # Check each game for two-way arbitrage opportunities
    for index, row in df.iterrows():
        home_odds = float(row['Home Odds'])
        away_odds = float(row['Away Odds'])
        
        # Check if this is an arbitrage opportunity (home vs away only)
        is_arbitrage, total_prob = check_two_way_arbitrage(home_odds, away_odds)
        
        print(f"\nAnalyzing: {row['Teams']}")
        print(f"Two-way odds: Home {home_odds}, Away {away_odds}")
        print(f"Two-way probability sum: {total_prob:.4f}")
        print(f"Is two-way arbitrage: {is_arbitrage}")
        
        if is_arbitrage:
            # Calculate optimal stakes
            home_stake, away_stake, guaranteed_return, profit, profit_percentage = calculate_two_way_stakes(
                total_stake, home_odds, away_odds
            )
            
            # Add to our list of arbitrage games
            arbitrage_games.append({
                'Date': row['Date'],
                'Teams': row['Teams'],
                'Sport': row['Sport'],
                'Home_Odds': home_odds,
                'Away_Odds': away_odds,
                'Two_Way_Implied_Probability': total_prob,
                'Home_Stake': round(home_stake, 2),
                'Away_Stake': round(away_stake, 2),
                'Guaranteed_Return': round(guaranteed_return, 2),
                'Profit': round(profit, 2),
                'Profit_Percentage': round(profit_percentage, 2)
            })
    
    # Create DataFrame from arbitrage opportunities
    if arbitrage_games:
        arb_df = pd.DataFrame(arbitrage_games)
        
        # Save to CSV
        arb_df.to_csv('betting_arbitrage.csv', index=False)
        print(f"\nFound {len(arbitrage_games)} two-way arbitrage opportunities! Saved to betting_arbitrage.csv")
        
        # Display the arbitrage opportunities
        print("\nArbitrage Opportunities Found:")
        for i, game in enumerate(arbitrage_games):
            print(f"\n{i+1}. {game['Teams']}")
            print(f"   Date: {game['Date']}")
            print(f"   Odds: Home {game['Home_Odds']}, Away {game['Away_Odds']}")
            print(f"   Two-Way Implied Probability: {round(game['Two_Way_Implied_Probability'], 4)}")
            print(f"   Optimal Stakes: Home ${game['Home_Stake']}, Away ${game['Away_Stake']}")
            print(f"   Guaranteed Return: ${game['Guaranteed_Return']}")
            print(f"   Profit: ${game['Profit']} ({game['Profit_Percentage']}%)")
    else:
        print("\nNo two-way arbitrage opportunities found in the data.")
        
        # Even if no true arbitrage opportunities, let's identify promising games
        promising_games = []
        for index, row in df.iterrows():
            home_odds = float(row['Home Odds'])
            away_odds = float(row['Away Odds'])
            total_prob = (1/home_odds) + (1/away_odds)
            
            if total_prob < 1.05:  # Within 5% of being arbitrage
                promising_games.append({
                    'Teams': row['Teams'],
                    'Home_Odds': home_odds,
                    'Away_Odds': away_odds,
                    'Two_Way_Implied_Probability': total_prob,
                    'Home_Stake': round((100 * (1/home_odds))/total_prob, 2),
                    'Away_Stake': round((100 * (1/away_odds))/total_prob, 2),
                    'Profit_Percentage': round((1-total_prob)*100, 2)
                })
        
        if promising_games:
            # Save promising games to CSV as well
            promising_df = pd.DataFrame(promising_games)
            promising_df.to_csv('promising_arbitrage.csv', index=False)
            print("\nSaved promising near-arbitrage opportunities to promising_arbitrage.csv")
            
            print("\nPromising games (close to two-way arbitrage):")
            for i, game in enumerate(promising_games):
                print(f"\n{i+1}. {game['Teams']}")
                print(f"   Odds: Home {game['Home_Odds']}, Away {game['Away_Odds']}")
                print(f"   Two-Way Implied Probability: {round(game['Two_Way_Implied_Probability'], 4)}")
                print(f"   This is {round((game['Two_Way_Implied_Probability']-1)*100, 2)}% above arbitrage threshold")

if __name__ == "__main__":
    main()
