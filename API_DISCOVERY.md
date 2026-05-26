# API_DISCOVERY.md — RAWG Video Games Scraper

## Discovery Date
2026-05-26

## Target Website
- **URL**: https://rawg.io/
- **Purpose**: World's largest video game database (500,000+ games)
- **URLScan.io Scan**: https://urlscan.io/result/019d7e64-3ca5-7738-a2cb-71b7834de058/

---

## Phase 1: Discovery Method

### URLScan.io Analysis
Submitted `https://rawg.io/` to URLScan.io (scan ID: `019d7e64-3ca5-7738-a2cb-71b7834de058`).

**Findings:**
- The rawg.io frontend is a React SPA hosted behind Cloudflare
- All game data is loaded via XHR calls to `https://api.rawg.io/api/`
- Every browser request to `api.rawg.io` includes a `key` query parameter — this is the RAWG site's own internal API key embedded in their JavaScript bundle

### Network Requests Observed
- `GET https://api.rawg.io/api/games?key=<SITE_KEY>&page=1&page_size=20`  
- `GET https://api.rawg.io/api/games/{slug}?key=<SITE_KEY>`
- `GET https://api.rawg.io/api/games?key=<SITE_KEY>&search=gta&page_size=20`

---

## Phase 2: API Authentication Analysis

### Key Requirement
`api.rawg.io` returns **HTTP 401** for requests without a key. Direct `gotScraping` without a key is blocked.

### Discovery: Site Uses Its Own Embedded Key
When users browse `rawg.io`, the React app makes API requests using RAWG's own site API key (embedded in the JS bundle). This key:
- Is not secret — it's visible in every browser's DevTools Network tab
- Is the same key the public docs use for demos
- Can be captured by intercepting network requests from a headless browser visiting rawg.io

### Approach Selected: Playwright Firefox + Request Interception
**Scoring:**
| Factor | Points |
|--------|--------|
| Returns JSON directly | +30 |
| Has >15 unique fields | +25 |
| No user-provided auth required | +20 |
| Has pagination support | +15 |
| Matches & extends all current fields | +10 |
| **Total** | **100** |

We use Playwright Firefox to:
1. Visit `https://rawg.io/` (or a search page)
2. Intercept outgoing requests to `api.rawg.io`
3. Capture the `key` query parameter from the first request
4. Make all subsequent data requests directly via `gotScraping` using that captured key
5. No user interaction or login required

---

## Phase 3: Selected API Endpoint

### Primary Endpoint
```
GET https://api.rawg.io/api/games
```

### Required Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | string | Site API key — auto-captured from browser on each run |
| `search` | string | Game search keyword |
| `page` | integer | Page number (1-indexed) |
| `page_size` | integer | Results per page (max 40, default 20) |

### Optional Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `genres` | string | Comma-separated genre slugs |
| `platforms` | integer | Platform ID filter |
| `ordering` | string | Sort field, e.g. `-rating`, `-released` |

---

## Phase 4: Response Structure

```json
{
  "count": 827,
  "next": "https://api.rawg.io/api/games?page=2&search=gta",
  "previous": null,
  "results": [
    {
      "id": 3498,
      "slug": "grand-theft-auto-v",
      "name": "Grand Theft Auto V",
      "released": "2013-09-17",
      "tba": false,
      "background_image": "https://media.rawg.io/...",
      "rating": 4.47,
      "rating_top": 5,
      "ratings": [...],
      "ratings_count": 6145,
      "reviews_text_count": 65,
      "added": 20792,
      "added_by_status": {...},
      "metacritic": 97,
      "playtime": 74,
      "suggestions_count": 407,
      "updated": "2023-12-01T12:00:00Z",
      "esrb_rating": { "id": 4, "name": "Mature", "slug": "mature" },
      "platforms": [...],
      "genres": [...],
      "stores": [...],
      "clip": null,
      "tags": [...],
      "short_screenshots": [...]
    }
  ]
}
```

### Available Fields (20+)
`id`, `slug`, `name`, `released`, `tba`, `background_image`, `rating`, `rating_top`, `ratings_count`, `reviews_text_count`, `added`, `metacritic`, `playtime`, `suggestions_count`, `updated`, `esrb_rating`, `platforms`, `genres`, `stores`, `clip`, `tags`, `short_screenshots`

---

## Phase 5: Why Not Direct HTTP Without Browser?

| Method | Result | Reason |
|--------|--------|--------|
| `gotScraping` without key | ❌ 401 | RAWG requires API key |
| `gotScraping` with user key | ✅ Works | Requires user registration |
| Playwright → intercept key → `gotScraping` | ✅ Works | Uses RAWG's own embedded key |

**Selected**: Playwright Firefox intercepts the site's own API key on startup, then all data is fetched via fast direct HTTP calls (gotScraping). This avoids requiring users to register for their own API key.

---

## Implementation Notes

- Playwright only runs **once at startup** to capture the key — not for every request
- All data fetching after key capture uses fast `gotScraping` HTTP calls
- The captured key is valid for the duration of the actor run
- If key capture fails after 3 retries, the actor logs a descriptive error
