# RAWG Video Games Scraper

Extract comprehensive video game data from the RAWG Video Games Database — the world's largest game catalog with 500,000+ titles. Collect game names, ratings, release dates, genres, platforms, Metacritic scores, and more in seconds. **No API key required** — just provide a keyword or URL and the scraper handles the rest. Perfect for game research, market analysis, and dataset building.

## Features

- **No API Key Needed** — Start scraping immediately without any registration or setup
- **Keyword Search** — Find games by any search term or franchise name
- **URL Support** — Pass any RAWG search URL directly and scrape from there
- **Rich Game Data** — Extracts 15+ fields including ratings, genres, platforms, and Metacritic scores
- **Pagination** — Automatically fetches multiple pages to reach your desired result count
- **Zero Null Fields** — Only fields with real data are included; no empty clutter in the output
- **Fast & Efficient** — Browser runs once to authenticate, then all data is fetched via high-speed API calls

---

## Use Cases

### Game Market Research
Analyze ratings, genre trends, and platform distribution across thousands of titles. Identify what kinds of games perform best on which platforms and build data-driven insights for publishers or investors.

### Competitive Intelligence
Track how competitor titles perform over time by collecting Metacritic scores, user ratings, and player counts. Monitor newly released games in specific genres or on specific platforms.

### Dataset Building for ML / AI
Build high-quality labeled datasets of video games for machine learning models, recommendation engines, or academic research. Export to JSON, CSV, or Excel for immediate use.

### Game Discovery & Curation
Power your own game discovery app or website with structured data from a trusted, comprehensive source covering PC, PlayStation, Xbox, Nintendo, and mobile titles.

### Gaming Journalism & Analytics
Quickly gather data for articles, reviews, or industry reports. Compare ratings, identify underrated gems, or surface trending titles by release date or community engagement.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | — | A RAWG search URL (e.g. `https://rawg.io/games?search=zelda`). Takes priority over Keyword. |
| `keyword` | String | No | — | Game search keyword, e.g. `grand theft auto`, `FIFA`, `action RPG`. |
| `results_wanted` | Integer | No | `20` | Maximum number of games to collect. |
| `max_pages` | Integer | No | `5` | Maximum pages to fetch (20 games per page). |
| `proxyConfiguration` | Object | No | — | Optional Apify proxy settings. |

> **No API key required.** The scraper works out of the box — simply provide a keyword or a RAWG URL and start collecting.

---

## Output Data

Each item in the dataset contains the following fields (only populated fields are included):

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | RAWG internal game ID |
| `slug` | String | URL-friendly game identifier |
| `name` | String | Official game title |
| `url` | String | Link to the game page on RAWG |
| `released` | String | Release date (YYYY-MM-DD) |
| `rating` | Number | Average user rating (0–5 scale) |
| `rating_top` | Integer | Maximum possible rating |
| `ratings_count` | Integer | Total number of user ratings |
| `reviews_count` | Integer | Total number of written reviews |
| `metacritic` | Integer | Metacritic score (0–100) |
| `background_image` | String | URL to the game's cover image |
| `genres` | String | Comma-separated genre names |
| `platforms` | String | Comma-separated platform names |
| `stores` | String | Comma-separated store names |
| `tags` | String | Top 5 community tags |
| `esrb_rating` | String | ESRB age rating (e.g. Mature, Teen) |
| `playtime_hours` | Integer | Average playtime in hours |
| `added` | Integer | Number of users who added this game |
| `clip_url` | String | Gameplay clip/trailer URL (if available) |

---

## Usage Examples

### Search by Keyword

Collect the top 20 GTA games:

```json
{
    "keyword": "grand theft auto",
    "results_wanted": 20
}
```

### Search by RAWG URL

Scrape games from a specific RAWG search page:

```json
{
    "startUrl": "https://rawg.io/games?search=zelda",
    "results_wanted": 50
}
```

### Collect More Results

Fetch up to 100 games across 5 pages:

```json
{
    "keyword": "RPG",
    "results_wanted": 100,
    "max_pages": 5
}
```

---

## Sample Output

```json
{
    "id": 3498,
    "slug": "grand-theft-auto-v",
    "name": "Grand Theft Auto V",
    "url": "https://rawg.io/games/grand-theft-auto-v",
    "released": "2013-09-17",
    "rating": 4.47,
    "rating_top": 5,
    "ratings_count": 6145,
    "reviews_count": 65,
    "metacritic": 97,
    "background_image": "https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060601f68f6aa11.jpg",
    "genres": "Action, Adventure",
    "platforms": "PC, PlayStation 5, Xbox Series S/X, PlayStation 4, Xbox One",
    "stores": "Steam, PlayStation Store, Xbox 360 Store, Google Play, Xbox Store",
    "tags": "Singleplayer, Multiplayer, Open World, Third Person, Atmospheric",
    "esrb_rating": "Mature",
    "playtime_hours": 74,
    "added": 20792
}
```

---

## Tips for Best Results

### Use Start URL for Precision
If you already have a RAWG search URL (e.g. from browsing the site), paste it directly into the `startUrl` field. The scraper parses the search query and fetches the exact same results.

### Start Small, Scale Up
Start with `results_wanted: 20` to verify the data looks correct before scaling up. Large runs of 500+ games are fully supported.

### Both Inputs are Optional
If neither `startUrl` nor `keyword` is provided, the scraper returns trending/popular games from RAWG's default game listing.

---

## Integrations

Connect your game data with:

- **Google Sheets** — Export CSV for spreadsheet analysis and sharing
- **Airtable** — Build a searchable, filterable game database
- **Make (Integromat)** — Trigger automated workflows on new data
- **Zapier** — Connect to 5,000+ apps automatically
- **Webhooks** — POST results to your own endpoint in real time
- **Slack** — Get notifications when a scraping run completes

### Export Formats

- **JSON** — For developers and API integrations
- **CSV** — For Excel, Google Sheets, and BI tools
- **XML** — For legacy system integrations
- **Excel** — For business reporting

---

## Frequently Asked Questions

### Do I need an API key or account?
No. The scraper works without any registration, API key, or account. Just provide a keyword or URL and run.

### How many games can I collect?
RAWG's database contains 500,000+ games. Increase `results_wanted` and `max_pages` to collect as many as you need.

### Can I scrape a specific genre or platform?
Yes — use a RAWG search URL that already filters by genre or platform in the `startUrl` field. Browse rawg.io, apply your filters, and copy the URL.

### Why are some fields missing from results?
Only fields with actual data are included. If a game has no Metacritic score, no `metacritic` field appears in that record — keeping the dataset clean.

### Does it work without a proxy?
Yes. No proxy is required for normal usage.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [RAWG Database](https://rawg.io/)
- [Scheduling Runs](https://docs.apify.com/schedules)

---

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring compliance with RAWG's terms of service at [rawg.io](https://rawg.io) and applicable laws. Use data responsibly and respect rate limits.
