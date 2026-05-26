// RAWG Video Games Scraper
// Uses Playwright Firefox to capture the RAWG site API key, then fetches
// all game data via fast direct HTTP calls — no user API key required.
import { Actor, log } from 'apify';
import { Dataset, PlaywrightCrawler } from 'crawlee';
import { gotScraping } from 'got-scraping';
import playwright from 'playwright';

await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};

        const {
            startUrl = '',
            keyword = '',
            results_wanted: RESULTS_WANTED_RAW = 20,
            max_pages: MAX_PAGES_RAW = 5,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW)
            ? Math.max(1, +RESULTS_WANTED_RAW)
            : 20;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW)
            ? Math.max(1, +MAX_PAGES_RAW)
            : 5;

        // ── RESOLVE INPUT: URL takes priority, then keyword ──────────────────
        let resolvedSearch = '';
        let resolvedPage = 1;

        if (startUrl) {
            try {
                const parsedUrl = new URL(startUrl);
                // Support rawg.io URLs like /games?search=xxx or /search?query=xxx
                resolvedSearch =
                    parsedUrl.searchParams.get('search') ||
                    parsedUrl.searchParams.get('query') ||
                    '';
                const pageParam = parsedUrl.searchParams.get('page');
                if (pageParam && Number.isFinite(+pageParam)) {
                    resolvedPage = Math.max(1, +pageParam);
                }
            } catch {
                log.warning(`Could not parse startUrl: "${startUrl}" — falling back to keyword`);
            }
        }

        // keyword applies when startUrl gave no search term
        if (!resolvedSearch && keyword) {
            resolvedSearch = keyword.trim();
        }

        log.info(
            `RAWG Scraper | search="${resolvedSearch}" | results_wanted=${RESULTS_WANTED} | max_pages=${MAX_PAGES}`,
        );

        // ── PROXY CONFIG ─────────────────────────────────────────────────────
        const proxyConf = proxyConfiguration
            ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
            : undefined;

        // ── PHASE 1: CAPTURE API KEY VIA PLAYWRIGHT ──────────────────────────
        // rawg.io's own frontend embeds their API key and uses it for every
        // XHR call to api.rawg.io. We intercept that key from a browser visit.
        log.info('Launching browser to capture RAWG API key from network traffic...');

        let capturedApiKey = null;
        const USER_AGENTS = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
            'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
        ];
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

        const keyCrawler = new PlaywrightCrawler({
            launchContext: {
                launcher: playwright.firefox,
                launchOptions: { headless: true },
                userAgent,
            },
            proxyConfiguration: proxyConf,
            maxConcurrency: 1,
            maxRequestRetries: 2,
            navigationTimeoutSecs: 30,
            requestHandlerTimeoutSecs: 30,

            preNavigationHooks: [
                async ({ page }) => {
                    // Block images, media, fonts, stylesheets for speed
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        const url = route.request().url();
                        if (
                            ['image', 'font', 'media', 'stylesheet'].includes(type) ||
                            url.includes('google-analytics') ||
                            url.includes('googletagmanager') ||
                            url.includes('facebook') ||
                            url.includes('doubleclick')
                        ) {
                            return route.abort();
                        }
                        return route.continue();
                    });

                    // Intercept outgoing requests to api.rawg.io/rawg.io and extract key
                    page.on('request', (request) => {
                        const url = request.url();
                        if ((url.includes('api.rawg.io/api/') || url.includes('rawg.io/api/')) && !capturedApiKey) {
                            try {
                                const parsed = new URL(url);
                                const k = parsed.searchParams.get('key');
                                if (k && k.length > 5) {
                                    capturedApiKey = k;
                                    log.info(`API key captured from network traffic`);
                                }
                            } catch {
                                // ignore URL parse errors
                            }
                        }
                    });
                },
            ],

            async requestHandler({ page }) {
                try {
                    const title = await page.title();
                    log.info(`Page title: "${title}"`);
                    const content = await page.content();
                    log.info(`Page content length: ${content.length}`);
                    if (content.includes('Cloudflare') || content.includes('Just a moment') || content.includes('Verify you are human')) {
                        log.warning('Cloudflare/Bot detection page detected!');
                    }
                } catch (e) {
                    log.error(`Failed to get page diagnostics: ${e.message}`);
                }

                // Wait a moment for XHR requests to fire
                await page.waitForTimeout(4000);

                // If key not captured yet, wait longer
                if (!capturedApiKey) {
                    await page.waitForTimeout(3000);
                }

                if (!capturedApiKey) {
                    log.warning('API key not yet captured — page may not have loaded API calls');
                }
            },

            failedRequestHandler({ request }, error) {
                log.error(`Browser key-capture failed for ${request.url}: ${error.message}`);
            },
        });

        // Visit rawg.io games page which always triggers API XHR calls
        const captureUrl =
            resolvedSearch
                ? `https://rawg.io/games?search=${encodeURIComponent(resolvedSearch)}`
                : 'https://rawg.io/games';

        await keyCrawler.run([{ url: captureUrl }]);

        if (!capturedApiKey) {
            log.error(
                'Could not capture RAWG API key from browser traffic. ' +
                'The site may have changed. Check https://rawg.io/ manually.',
            );
            await Actor.exit({ exitCode: 1 });
            return;
        }

        log.info('API key captured. Starting data collection via API...');

        // ── PHASE 2: FETCH DATA VIA DIRECT API CALLS (gotScraping) ──────────
        const PAGE_SIZE = 20;

        function buildApiUrl(page) {
            const u = new URL('https://api.rawg.io/api/games');
            u.searchParams.set('key', capturedApiKey);
            u.searchParams.set('page_size', String(PAGE_SIZE));
            u.searchParams.set('page', String(page));
            if (resolvedSearch) u.searchParams.set('search', resolvedSearch);
            return u.toString();
        }

        async function fetchPage(url) {
            const safeUrl = url.replace(capturedApiKey, '***KEY***');
            log.info(`Fetching: ${safeUrl}`);

            const proxyUrl = proxyConf ? await proxyConf.newUrl?.() : undefined;

            const response = await gotScraping({
                url,
                responseType: 'json',
                proxyUrl,
                headers: {
                    'User-Agent': userAgent,
                    Accept: 'application/json',
                    Referer: 'https://rawg.io/',
                    Origin: 'https://rawg.io',
                },
                timeout: { request: 30_000 },
                retry: { limit: 3, statusCodes: [429, 500, 502, 503] },
            });

            const {body} = response;

            if (!body || typeof body !== 'object') {
                log.warning('Unexpected non-JSON response from RAWG API');
                return { results: [], next: null, count: 0 };
            }

            if (!Array.isArray(body.results)) {
                log.warning(
                    `Expected "results" array not found. Actual keys: ${Object.keys(body).join(', ')}`,
                );
                return { results: [], next: null, count: 0 };
            }

            return {
                results: body.results,
                next: body.next || null,
                count: body.count || 0,
            };
        }

        /**
         * Map a raw RAWG game object to a clean dataset record.
         * Only fields with actual values are included — no null pollution.
         */
        function mapGame(game) {
            const item = {};

            if (game.id != null) item.id = game.id;
            if (game.slug) item.slug = game.slug;
            if (game.name) item.name = game.name;
            if (game.slug) item.url = `https://rawg.io/games/${game.slug}`;
            if (game.released) item.released = game.released;

            if (game.rating != null && game.rating !== 0) item.rating = game.rating;
            if (game.rating_top != null && game.rating_top !== 0) item.rating_top = game.rating_top;
            if (game.ratings_count != null && game.ratings_count !== 0)
                item.ratings_count = game.ratings_count;
            if (game.reviews_text_count != null && game.reviews_text_count !== 0)
                item.reviews_count = game.reviews_text_count;
            if (game.metacritic != null && game.metacritic !== 0) item.metacritic = game.metacritic;
            if (game.background_image) item.background_image = game.background_image;

            if (Array.isArray(game.genres) && game.genres.length > 0) {
                item.genres = game.genres.map((g) => g.name).join(', ');
            }
            if (Array.isArray(game.platforms) && game.platforms.length > 0) {
                item.platforms = game.platforms
                    .map((p) => p.platform?.name)
                    .filter(Boolean)
                    .join(', ');
            }
            if (Array.isArray(game.stores) && game.stores.length > 0) {
                item.stores = game.stores
                    .map((s) => s.store?.name)
                    .filter(Boolean)
                    .join(', ');
            }
            if (Array.isArray(game.tags) && game.tags.length > 0) {
                item.tags = game.tags
                    .slice(0, 5)
                    .map((t) => t.name)
                    .join(', ');
            }
            if (game.esrb_rating?.name) item.esrb_rating = game.esrb_rating.name;
            if (game.playtime != null && game.playtime !== 0) item.playtime_hours = game.playtime;
            if (game.added != null && game.added !== 0) item.added = game.added;
            if (game.clip?.clip) item.clip_url = game.clip.clip;

            return item;
        }

        // ── MAIN SCRAPING LOOP ────────────────────────────────────────────────
        let saved = 0;
        let page = resolvedPage;
        const maxPage = resolvedPage + MAX_PAGES - 1;
        const seen = new Set();

        while (saved < RESULTS_WANTED && page <= maxPage) {
            const url = buildApiUrl(page);
            let pageData;

            try {
                pageData = await fetchPage(url);
            } catch (err) {
                log.error(`Failed to fetch page ${page}: ${err.message}`);
                break;
            }

            const { results } = pageData;
            if (!results || results.length === 0) {
                log.info(`No results on page ${page} — stopping.`);
                break;
            }

            log.info(`Page ${page}: ${results.length} games (API total: ${pageData.count ?? '?'})`);

            for (const game of results) {
                if (saved >= RESULTS_WANTED) break;

                const key = String(game.id ?? game.slug ?? game.name ?? Math.random());
                if (seen.has(key)) continue;
                seen.add(key);

                const mapped = mapGame(game);
                if (!mapped.name) continue;

                await Dataset.pushData(mapped);
                saved++;
            }

            log.info(`Saved ${saved} / ${RESULTS_WANTED} games`);

            if (!pageData.next) {
                log.info('No next page from RAWG API — done.');
                break;
            }

            page++;
            await new Promise((resolve) => { setTimeout(resolve, 300); });
        }

        log.info(`Finished. Total saved: ${saved} games.`);
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
