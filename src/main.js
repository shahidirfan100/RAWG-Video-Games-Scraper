// RAWG Video Games Scraper
// Uses Playwright Firefox to capture the RAWG site API key, then fetches
// all game data via fast direct HTTP calls — no user API key required.
import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
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

        let capturedApiKey = null;
        const USER_AGENTS = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
            'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
        ];
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

        // ── PHASE 1: CAPTURE API KEY VIA PLAYWRIGHT (FAST PATH) ─────────────
        // rawg.io's own frontend embeds their API key and uses it for every
        // XHR call to api.rawg.io. We intercept that key from a browser visit.
        if (!capturedApiKey) {
            log.info('Launching lightweight browser to capture RAWG API key...');

            const proxyUrl = proxyConf ? await proxyConf.newUrl?.() : undefined;
            const launchOptions = { headless: true };
            const browser = await playwright.firefox.launch(launchOptions);

            try {
                const contextOptions = {
                    userAgent,
                    viewport: { width: 1366, height: 768 },
                };
                if (proxyUrl) {
                    const parsedProxy = new URL(proxyUrl);
                    contextOptions.proxy = {
                        server: `${parsedProxy.protocol}//${parsedProxy.host}`,
                        username: parsedProxy.username || undefined,
                        password: parsedProxy.password || undefined,
                    };
                }

                const context = await browser.newContext(contextOptions);
                const page = await context.newPage();

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

                const keyPromise = new Promise((resolve) => {
                    const timer = setTimeout(() => resolve(null), 10_000);

                    page.on('request', (request) => {
                    const reqUrl = request.url();
                    if ((reqUrl.includes('api.rawg.io/api/') || reqUrl.includes('rawg.io/api/')) && !capturedApiKey) {
                        try {
                            const parsed = new URL(reqUrl);
                            const k = parsed.searchParams.get('key');
                            if (k && k.length > 5) {
                                capturedApiKey = k;
                                log.info('API key captured from browser network traffic');
                                clearTimeout(timer);
                                resolve(k);
                            }
                        } catch {
                            // ignore URL parse errors
                        }
                    }
                });
                });

                const captureUrl =
                    resolvedSearch
                        ? `https://rawg.io/games?search=${encodeURIComponent(resolvedSearch)}`
                        : 'https://rawg.io/games';

                await page.goto(captureUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                await keyPromise;
            } catch (err) {
                log.error(`Browser key-capture failed: ${err.message}`);
            } finally {
                await browser.close();
            }
        }

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
        const PAGE_SIZE = 40;

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
        function uniqueTextValues(values) {
            const normalizedToOriginal = new Map();
            for (const value of values) {
                if (!value) continue;
                const cleaned = String(value).trim();
                if (!cleaned) continue;
                const normalized = cleaned.toLowerCase();
                if (!normalizedToOriginal.has(normalized)) {
                    normalizedToOriginal.set(normalized, cleaned);
                }
            }
            return [...normalizedToOriginal.values()];
        }

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
                const genres = uniqueTextValues(game.genres.map((g) => g?.name));
                if (genres.length > 0) item.genres = genres.join(', ');
            }
            if (Array.isArray(game.platforms) && game.platforms.length > 0) {
                const platforms = uniqueTextValues(game.platforms.map((p) => p.platform?.name));
                if (platforms.length > 0) item.platforms = platforms.join(', ');
            }
            if (Array.isArray(game.stores) && game.stores.length > 0) {
                const stores = uniqueTextValues(game.stores.map((s) => s.store?.name));
                if (stores.length > 0) item.stores = stores.join(', ');
            }
            if (Array.isArray(game.tags) && game.tags.length > 0) {
                const tags = uniqueTextValues(game.tags.map((t) => t?.name)).slice(0, 5);
                if (tags.length > 0) item.tags = tags.join(', ');
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

            const pageItems = [];
            for (const game of results) {
                if (saved >= RESULTS_WANTED) break;

                const key = String(game.id ?? game.slug ?? game.name ?? Math.random());
                if (seen.has(key)) continue;
                seen.add(key);

                const mapped = mapGame(game);
                if (!mapped.name) continue;

                pageItems.push(mapped);
                saved++;
            }

            if (pageItems.length > 0) {
                await Dataset.pushData(pageItems);
            }

            log.info(`Saved ${saved} / ${RESULTS_WANTED} games`);

            if (!pageData.next) {
                log.info('No next page from RAWG API — done.');
                break;
            }
            page++;
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
