# extract_odds.py
import os
import csv
import time

import requests
from bs4 import BeautifulSoup

def scrape_betpawa_odds(url, csv_file="betpawa_odds.csv"):
    """
    Scrape sports betting odds from BetPawa Rwanda website using requests and BeautifulSoup.
    Extracts date, team names, sport type, and odds.
    """

    # Initialize CSV
    with open(csv_file, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["Date", "Teams", "Sport", "Home Odds", "Draw Odds", "Away Odds"])

    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    try:
        print(f"Fetching URL: {url}")
        response = requests.get(url, headers=headers)
        response.raise_for_status()
    except Exception as e:
        print(f"❌ Error fetching page: {e}")
        return

    soup = BeautifulSoup(response.content, "html.parser")

    # Attempt to find all event containers (you can update this CSS selector based on actual structure)
    events = soup.select(".event, .prematch, .match-row, tr")

    print(f"Found {len(events)} event elements")

    for event in events:
        date_str = "N/A"
        teams = "N/A"
        home_odds = "N/A"
        draw_odds = "N/A"
        away_odds = "N/A"

        try:
            text = event.get_text(separator="\n").strip()
            lines = text.split("\n")

            if len(lines) >= 6:
                date_str = lines[0]
                teams = f"{lines[1]} vs {lines[2]}"
                home_odds = lines[-6]
                draw_odds = lines[-4]
                away_odds = lines[-2]
        except Exception as e:
            print(f"⚠️ Error extracting data: {e}")

        if home_odds != "N/A" and draw_odds != "N/A" and away_odds != "N/A":
            with open(csv_file, mode="a", newline="", encoding="utf-8") as file:
                writer = csv.writer(file)
                writer.writerow([date_str, teams, "Football", home_odds, draw_odds, away_odds])
            print(f"✅ Saved: {teams} on {date_str} | Odds: {home_odds}, {draw_odds}, {away_odds}")
        else:
            print(f"⚠️ Incomplete odds for: {teams}")

        
if __name__ == "__main__":
    url = "https://www.betpawa.rw/events?marketId=1X2&categoryId=2"  # similar to https://www.betpawa.rw/events
    scrape_betpawa_odds(url)
    print("Scraping completed. Data saved to betpawa_odds.csv")
