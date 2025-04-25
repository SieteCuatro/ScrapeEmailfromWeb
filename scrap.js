// --- Dependency Check (Optional but recommended) ---
try {
    require.resolve('playwright');
    require.resolve('csv-parser');
    require.resolve('csv-writer');
    require.resolve('async-mutex');
    require.resolve('limiter');
    require.resolve('cli-progress');
} catch (e) {
    console.error("Error: Required dependency not found. Please run 'npm install'.", e.message);
    process.exit(1);
}
// --- End Dependency Check ---


const playwright = require('playwright');
const csv = require('csv-parser');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { URL } = require('url');
const { Semaphore } = require('async-mutex');
const { RateLimiter } = require('limiter');
const cliProgress = require('cli-progress');
const os = require('os'); // For getting CPU/Memory info (optional)

// --- Configuration Section ---
const config = {
    // --- Basic Settings ---
    inputFile: 'Leads.csv',
    pageLoadTimeout: 5000, // Slightly increased timeout
    maxDepth: 1, // How many levels deep to follow links (0 = initial only, 1 = initial + 1 level)
    concurrency: 5, // Number of tasks to run in parallel (adjust based on system resources)
    // --- Retries ---
    navigationRetries: 1, // How many times to retry page.goto on network errors/timeouts
    retryDelay: 3000,     // Delay in milliseconds between retries

    // --- Filtering (Comprehensive Examples - Adjust to your needs) ---
    // Emails containing these strings will be excluded (case-insensitive)
    emailFilter: [
        // Common non-contact prefixes/patterns
        'noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'bounce', 'support@',
        'admin@', 'administrator@', 'webmaster@', 'hostmaster@', 'postmaster@',
        'spam', 'abuse', 'info@', // Caution: info@/support@ might be desired contact points
        'privacy', 'legal', 'copyright', 'media@', 'press@', 'jobs@', 'careers@', 'hr@',
        // Common generic domains often used in examples or placeholders
        'example.com', 'domain.com', 'site.com', 'website.com', 'company.com',
        'mydomain.com', 'mysite.com', 'yourdomain.com', 'yoursite.com',
        'email.com', 'mail.com', 'test.com', 'invalid.com', 'xxx.com',
        // Domains associated with tracking/errors (often embedded)
        'sentry.io', '@sentry.', '@wix.com', '@wixpress.com', 'googletagmanager.com',
        // File extensions (prevent false positives like file@domain.com/img.png)
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.css', '.js', '.pdf', '.zip',
        // Specific user parts often not relevant
        'username@', 'user@', 'guest@',
    ],
    // Links pointing to these domains will NOT be followed during crawling
    excludedDomains: [
        // Social Media
        'facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'pinterest.com',
        'youtube.com', 'vimeo.com', 'tiktok.com', 'reddit.com', 'whatsapp.com', 't.me', 'snapchat.com',
        // Major Platforms & CDNs
        'google.com', 'googleadservices.com', 'googletagmanager.com', 'doubleclick.net',
        'fonts.googleapis.com', 'fonts.gstatic.com', 'schema.org', 'w3.org', 'gstatic.com', 'ggpht.com',
        'amazon.com', 'amazonaws.com', 'cloudfront.net', 'apple.com', 'microsoft.com', 'windows.net',
        'cloudflare.com', 'cdn.jsdelivr.net', 'jsdelivr.com', 'unpkg.com', 'aspnetcdn.com', 'jquery.com',
        'cdnjs.cloudflare.com', 'ajax.googleapis.com', 'googlesyndication.com', 'googleusercontent.com',
        // Common Web Infrastructure / CMS / Hosting / Analytics
        'wordpress.org', 'wordpress.com', 'wpengine.com', 'wix.com', 'squarespace.com', 'godaddy.com',
        'shopify.com', 'bigcommerce.com', 'drupal.org', 'joomla.org', 'gravatar.com', 'typekit.net',
        'hubspot.com', 'salesforce.com', 'marketo.com', 'adobe.com', 'adobedtm.com', 'demdex.net',
        'clicktale.net', 'hotjar.com', 'crazyegg.com', 'optimizely.com', 'segment.com', 'mixpanel.com',
        // Developer / Code Platforms
        'github.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'docker.com', 'stackoverflow.com',
        // Design / Other Services
        'figma.com', 'intensedebate.com', 'disqus.com', 'addthis.com', 'sharethis.com',
        'criteo.com', 'adroll.com', 'trustpilot.com', 'openstreetmap.org', 'maps.google.com', 'bing.com',
        'paypal.com', 'stripe.com', 'braintreegateway.com', // Payment gateways often linked externally
        'zendesk.com', 'intercom.com', // Support platforms
    ],
    // Links ending in these file extensions will NOT be followed
    excludedExtensions: [
        // Styles, Scripts, Data
        '.css', '.js', '.json', '.xml', '.rss', '.atom', '.txt', '.csv', '.map', '.webmanifest', '.yaml', '.yml',
        // Images
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tif', '.tiff', '.psd', '.ai',
        // Documents
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf', '.tex',
        // Archives
        '.zip', '.rar', '.tar', '.gz', '.7z', '.bz2', '.iso', '.img',
        // Executables / Installers
        '.dmg', '.exe', '.apk', '.app', '.msi', '.deb', '.rpm',
        // Media
        '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.wav', '.ogg', '.webm', '.mkv', '.aac', '.flac',
        // Fonts
        '.woff', '.woff2', '.ttf', '.otf', '.eot', '.webfont',
        // Other
        '.pem', '.crt', '.key', // Certificates
    ],
    // Links containing these path patterns will NOT be followed (case-insensitive)
    excludedPatterns: [
        // Common Pages/Sections not usually containing primary contact emails
        '/privacy', '/terms', '/legal', '/disclaimer', '/security', '/cookies', '/sitemap', '/policy',
        '/faq', '/help', '/support', '/docs/', '/knowledgebase', '/contact', // Keep /contact? Depends if emails are often ONLY there
        '/about', '/company', '/team', '/history', '/mission', '/values',
        '/blog', '/news', '/press', '/media', '/events', '/portfolio', '/projects',
        '/careers', '/jobs', '/hiring', '/vacancies',
        // User Auth/Account/Settings
        '/login', '/register', '/signin', '/signup', '/account', '/profile', '/dashboard', '/settings',
        '/logout', '/password', '/reset', 'forgot-password', '/my-account/', '/auth/',
        // E-commerce / Store
        '/cart', '/checkout', '/order', '/wishlist', '/store/', '/shop/', '/product', '/category/', '/collections/',
        // WP & CMS Specific
        '/feed', '/wp-json/', '/wp-includes/', '/wp-content/', '/xmlrpc.php', '/wp-admin/', '/wp-login.php',
        'preview=true', 'attachment_id=', 'p=', 'cat=', 'tag=', // WP query params
        // Technical / System Paths / Frameworks
        '/cgi-bin/', '/node_modules/', '/vendor/', '/assets/', '/static/', '/public/', '/uploads/', '/images/',
        '/_next/static/', '/_nuxt/', '/dist/', '/build/', '/src/', '/lib/',
        '/api/', '/graphql', '/json-rpc', '/soap',
        // Actions & Non-Pages
        'javascript:void', 'tel:', '#', 'mailto:', 'data:image', 'blob:', 'ftp:', 'irc:',
        '/search', '/find', 'query=', 'filter=', 'sort=', 'page=', // Common query params
        'unsubscribe', 'subscribe', 'download', 'upload', 'share=', 'print=', 'add-to-cart', 'like', 'vote',
        'redirect=', 'next=', 'return_to=', 'ref=', 'utm_', 'gclid=', 'fbclid=', 'mc_cid=', 'mc_eid=', // Tracking
        'adtrack', '/ads', '/banner', '/sponsor', '/affiliate', '/track',
        'tel:', 'callto:', 'skype:', 'sms:', 'fax:', // Phone/Communication links
        '/comment', '/reply', '/reviews', // Comment/Review sections
        'popup', 'modal', // Popup triggers
        'lang=', 'locale=', '/language/', // Language switchers
    ],

    // --- Advanced Behavior ---
    useRateLimiting: true, // Throttle requests per second based on concurrency
    useUserAgents: true, // Rotate User-Agent header for each request
    useProxies: false, // Use proxies from the list below (requires adding real proxies)
    browserType: 'chromium', // 'chromium', 'firefox', or 'webkit'
    headless: true, // Set to false to watch the browser (useful for debugging)
    waitUntil: 'domcontentloaded', // Page load strategy: 'domcontentloaded', 'load', 'networkidle'

    // --- Lists for Rotation ---
    // PRE-POPULATED EXAMPLES: Add/Remove as needed
    userAgents: [
        // Chrome (Windows, Mac, Linux)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        // Firefox (Windows, Mac, Linux)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/114.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/114.0',
        // Safari (Mac, iOS)
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        // Edge (Windows)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.51',
        // Android Chrome
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    ],
    // Add REAL proxies here if useProxies is true. Format: 'http://[user:pass@]host:port' or 'socks5://...'
    proxies: [
        // 'http://user:password@your-proxy-provider.com:12345',
        // 'socks5://another_user:another_pass@another-proxy.net:6789',
    ],

    // --- Output ---
    outputFileSuffix: '_emails.csv', // Suffix added to input filename for output
    // --- Progress Reporting ---
    useProgressBar: true, // Use the multi-bar progress visualization
    // progressUpdateInterval not used when useProgressBar is true
};
// --- End Configuration Section ---

// --- Global Variables ---
const semaphore = new Semaphore(config.concurrency);
const rateLimiter = config.useRateLimiting ? new RateLimiter({ tokensPerInterval: config.concurrency, interval: 'second' }) : null;
const visitedUrls = new Set();
const existingEmails = new Set();
let activeTasks = 0;
let recentErrors = [];
const MAX_RECENT_ERRORS = 5;
let multiBar = null;
let taskBars = [];
let nextBarIndex = 0;
// --- End Global Variables ---

// --- Utility Functions ---
function normalizeUrl(urlString) {
    try {
        if (!urlString || typeof urlString !== 'string' || urlString.trim() === '' || urlString.startsWith('mailto:') || urlString.startsWith('tel:') || urlString.startsWith('javascript:')) { return null; }
        const urlObj = new URL(urlString);
        urlObj.hash = ''; // Remove fragment
        let pathname = urlObj.pathname;
        if (pathname.endsWith('/')) { pathname = pathname.slice(0, -1); } // Remove trailing slash
        let hostname = urlObj.hostname.toLowerCase();
        if (hostname.startsWith('www.')) { hostname = hostname.slice(4); } // Remove www.
        // Reconstruct with normalized components
        return `${urlObj.protocol.toLowerCase()}//${hostname}${pathname.toLowerCase()}${urlObj.search.toLowerCase()}`;
    } catch (error) {
        // console.warn(`URL normalization failed for: ${urlString}`); // Enable for debugging bad URLs
        return null;
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
// --- End Utility Functions ---


// --- scrapeEmails function ---
async function scrapeEmails(browser, url, depth, bar) { // Accept bar instance
    const normalizedUrl = normalizeUrl(url);
    // If URL is invalid, already visited, or points to an explicitly excluded domain, stop.
    if (!normalizedUrl || visitedUrls.has(normalizedUrl) || config.excludedDomains.some(domain => normalizedUrl.includes(`//${domain}/`))) {
        return [];
    }
    visitedUrls.add(normalizedUrl);

    let context = null;
    let page = null;
    const shortUrl = url.length > 60 ? url.substring(0, 57) + '...' : url; // For progress bar

    try {
        // Update bar status: Creating Context
        if (bar) bar.update({ status: 'CTX', url: shortUrl });

        // Apply rate limiting *before* creating context if enabled
        if (config.useRateLimiting && rateLimiter) {
             try { await rateLimiter.removeTokens(1); }
             catch (rateLimitError) { console.warn(`\nRate limiting error for ${shortUrl}: ${rateLimitError.message}. Continuing...`); }
        }

        // Create Browser Context
        try {
            const contextOptions = { javaScriptEnabled: true, ignoreHTTPSErrors: true };
            if (config.useUserAgents && config.userAgents.length > 0) {
                contextOptions.userAgent = config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
            }
            if (config.useProxies && config.proxies.length > 0) {
                const selectedProxy = config.proxies[Math.floor(Math.random() * config.proxies.length)];
                if (selectedProxy && (selectedProxy.startsWith('http://') || selectedProxy.startsWith('https://') || selectedProxy.startsWith('socks5://'))) {
                    contextOptions.proxy = { server: selectedProxy };
                } else {
                    console.warn(`\nInvalid proxy format skipped: ${selectedProxy || 'undefined'} for ${shortUrl}`);
                }
            }
            context = await browser.newContext(contextOptions);
        } catch (contextError) {
            throw new Error(`CTX Fail: ${contextError.message}`); // Add context prefix
        }

        // Create Page
        try {
            if (bar) bar.update({ status: 'PAGE', url: shortUrl }); // Status: Creating Page
            page = await context.newPage();
        } catch (pageError) {
             throw new Error(`PAGE Fail: ${pageError.message}`); // Add context prefix
        }

        // Navigate with Retries
        let navigationSuccess = false;
        for (let attempt = 0; attempt <= config.navigationRetries; attempt++) {
            try {
                if (bar) bar.update({ status: `NAV ${attempt + 1}/${config.navigationRetries + 1}`, url: shortUrl }); // Status: Navigating
                await page.goto(url, { timeout: config.pageLoadTimeout, waitUntil: config.waitUntil });
                navigationSuccess = true; break; // Exit loop on success
            } catch (error) {
                const isTimeout = error instanceof playwright.errors.TimeoutError;
                const isNetworkError = error.message.includes('net::ERR_'); // Common network errors
                if ((isTimeout || isNetworkError) && attempt < config.navigationRetries) {
                    if (bar) bar.update({ status: `RETRY ${attempt + 1}`, url: shortUrl });
                    // console.log(`\n[Retry ${attempt + 1}/${config.navigationRetries}] Navigation failed for ${shortUrl} (${error.message.split('\n')[0]}). Waiting ${config.retryDelay}ms...`); // Log retry below bar
                    await new Promise(resolve => setTimeout(resolve, config.retryDelay)); // Wait
                } else {
                    // Final failure after retries or non-retryable error
                    throw new Error(`NAV Fail (${attempt + 1}): ${error.message}`); // Add context and attempt count
                }
            }
        }

        // Extract Content
        let content = '';
        try {
             if (bar) bar.update({ status: 'HTML', url: shortUrl }); // Status: Getting Content
             content = await page.content();
        } catch(contentError) {
            // Ignore content errors if page navigates away or closes during extraction
            // console.warn(`\nCould not get content for ${shortUrl}: ${contentError.message}`);
             content = ''; // Proceed with empty content
        }

        // Scan for Emails and Links
        if (bar) bar.update({ status: 'SCAN', url: shortUrl }); // Status: Scanning Emails/Links
        const emailRegex = /\b(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi; // Global, case-insensitive
        let emailMatches = content.match(emailRegex);
        let foundEmails = new Set();
        if (emailMatches) {
             emailMatches.map(email => email.replace(/^mailto:/i, '').toLowerCase()) // Normalize
                         .filter(email => {
                             // Basic validity checks
                             if (email.length < 6 || email.length > 254 || !email.includes('.')) return false;
                             // Check against configured filters (case-insensitive)
                             return !config.emailFilter.some(filterItem => email.includes(filterItem.toLowerCase()));
                         })
                         .forEach(email => {
                            // Final check: Avoid emails ending in common file extensions often found in text
                            if (!config.excludedExtensions.some(ext => email.endsWith(ext))) {
                                foundEmails.add(email);
                            }
                        });
        }


        // Crawl Links if depth allows
        if (depth < config.maxDepth) {
             let links = [];
             try {
                 // Use Playwright's robust method to get all hrefs
                 links = await page.$$eval('a[href]', anchors =>
                     anchors.map(a => a.href).filter(href => href && typeof href === 'string' && href.trim() !== '')
                 );
             } catch (evalError) {
                 // Ignore $$eval errors, can happen on complex/dynamic pages or during navigation
                 // console.warn(`\nCould not evaluate links on ${shortUrl}: ${evalError.message}`);
             }

             const baseUrlObj = new URL(normalizedUrl);
             const baseHostname = baseUrlObj.hostname; // Already normalized
             const urlsToCrawl = new Set();

             for (const link of links) {
                 const normalizedLink = normalizeUrl(link); // Normalize the potential link

                 // Skip if invalid, already visited globally, or already queued from this page
                 if (!normalizedLink || visitedUrls.has(normalizedLink) || urlsToCrawl.has(normalizedLink)) {
                     continue;
                 }

                 try {
                     const linkUrlObj = new URL(normalizedLink);

                     // Skip non-http(s) protocols
                     if (linkUrlObj.protocol !== 'http:' && linkUrlObj.protocol !== 'https:') {
                         continue;
                     }

                     const linkHostname = linkUrlObj.hostname; // Already normalized

                     // Check if link domain is explicitly excluded
                     if (config.excludedDomains.some(excludedDomain => linkHostname.includes(excludedDomain))) {
                         continue;
                     }

                     // Check if it's the same domain OR a subdomain (adjust if only exact domain is needed)
                     const isSameDomainOrSubdomain = linkHostname === baseHostname || linkHostname.endsWith('.' + baseHostname);

                     if (isSameDomainOrSubdomain) {
                         const lowerLink = normalizedLink.toLowerCase();
                         const lowerPath = linkUrlObj.pathname.toLowerCase();

                         // Check against excluded extensions and patterns
                         if (!config.excludedExtensions.some(ext => lowerPath.endsWith(ext)) &&
                             !config.excludedPatterns.some(pattern => lowerLink.includes(pattern.toLowerCase())))
                         {
                             urlsToCrawl.add(link); // Add the original link for navigation
                         }
                     }
                 } catch (urlError) {
                     // Ignore errors creating URL objects from potentially malformed hrefs
                     // console.warn(`\nSkipping invalid link URL found on ${shortUrl}: ${link}`);
                 }
             }

             if (urlsToCrawl.size > 0) {
                 if (bar) bar.update({ status: `CRAWL (${urlsToCrawl.size})`, url: shortUrl }); // Status: Queuing crawl
                 // Important: Recursive calls don't update the parent bar directly here.
                 // They will acquire their own semaphore slot and bar when they run.
                 const childEmailsPromises = Array.from(urlsToCrawl).map(newUrl =>
                     scrapeEmails(browser, newUrl, depth + 1, null) // Pass null bar for children
                 );
                 // Wait for child scrapes and merge their emails
                 const childEmailsArrays = await Promise.all(childEmailsPromises);
                 childEmailsArrays.forEach(emailArray => emailArray.forEach(email => foundEmails.add(email)));
             }
        }

        return Array.from(foundEmails); // Return successful results

    } catch (error) {
        // Error handling moved to the promise chain in processCsv
        throw error; // Re-throw the original error
    } finally {
        // Cleanup context and page, always runs
        if (page) { try { await page.close(); } catch (e) { /* Ignore page close errors */ } }
        if (context) { try { await context.close(); } catch (e) { /* Ignore context close errors */ } }
        // Semaphore release moved to the promise chain in processCsv
    }
}


// --- processCsv function ---
async function processCsv() {
    const results = [];
    const headersSet = new Set();
    let originalHeaders = [];
    let browser = null;
    let rowsProcessed = 0;
    let startTime = Date.now();
    let completedTasks = 0;
    let totalTasks = 0;
    let processingPromises = []; // Use 'let'
    multiBar = null;
    taskBars = [];
    nextBarIndex = 0;
    recentErrors = [];

    console.log(`--- Starting Email Scraper ---`);
    console.log(`Input File: ${config.inputFile}`);
    console.log(`Concurrency: ${config.concurrency}, Max Depth: ${config.maxDepth}`);
    console.log(`Navigation Retries: ${config.navigationRetries}, Delay: ${config.retryDelay}ms`);
    console.log(`Browser: ${config.browserType}, Headless: ${config.headless}`);
    if (config.useRateLimiting) console.log(`Rate Limiting: Enabled`);
    if (config.useUserAgents) console.log(`User Agents: Enabled (${config.userAgents.length} loaded)`);
    if (config.useProxies) console.log(`Proxies: Enabled (${config.proxies.length} loaded)`);

    try {
        console.log("Launching browser...");
        try {
            browser = await playwright[config.browserType].launch({ headless: config.headless });
            console.log("Browser launched successfully.");
        } catch (launchError) {
            console.error(`\nFATAL ERROR: Failed to launch browser (${config.browserType}): ${launchError.message}`);
            console.error("Ensure browsers are installed (run 'npx playwright install') and dependencies are met.");
             process.exit(1);
        }

        const readStream = fs.createReadStream(config.inputFile);
        readStream.on('error', (err) => { console.error(`\nFATAL ERROR: Could not read input file ${config.inputFile}: ${err.message}`); process.exit(1); });

        const parser = csv();
        parser.on('headers', (hdrs) => {
             originalHeaders = hdrs;
             console.log(`Input CSV Headers: ${originalHeaders.join(', ')}`);
             if (!originalHeaders.includes('Website')) {
                 console.error("\nFATAL ERROR: Input CSV must contain a 'Website' column (case-sensitive).");
                 parser.destroy(); readStream.destroy(); if (browser) browser.close(); process.exit(1);
             }
        });

        const rowDataForPromises = [];
        console.log("Reading CSV file...");

        for await (const row of readStream.pipe(parser)) {
             rowsProcessed++;
             const website = row.Website ? String(row.Website).trim() : '';
             let urlToScrape = website;
             // Basic URL validation and prefixing
             if (website && !website.includes('.') && website.length > 3) { // Basic non-domain check
                 if (!website.startsWith('http://') && !website.startsWith('https://')) { urlToScrape = 'http://' + website; }
             } else if (!website) { urlToScrape = null; } // Skip empty
             else if (!website.startsWith('http://') && !website.startsWith('https://') && website.includes('.')) { urlToScrape = 'http://' + website; } // Add protocol if missing
             else if (!website.includes('.')){ urlToScrape = null; } // Skip if no dot (likely invalid)

             if (urlToScrape) {
                 rowDataForPromises.push({ originalRow: row, urlToScrape: urlToScrape });
             }
        }

        totalTasks = rowDataForPromises.length;
        console.log(`Finished reading CSV (${rowsProcessed} rows). Initiating ${totalTasks} scraping tasks...`);

        // --- Initialize MultiBar ---
        if (config.useProgressBar && totalTasks > 0) {
            multiBar = new cliProgress.MultiBar({
                format: ' {bar} | {status} | {url}', // Format for individual bars
                barCompleteChar: '\u2588', barIncompleteChar: '\u2591', hideCursor: true,
                clearOnComplete: false, stream: process.stderr, // Use stderr to avoid messing with console.log
            }, cliProgress.Presets.shades_grey);

            for (let i = 0; i < config.concurrency; i++) {
                taskBars.push(multiBar.create(1, 0, { status: 'Idle', url: `Slot ${i + 1}` }));
            }
             console.log(`Progress Bars Initialized (showing ${config.concurrency} concurrent slots).`);
        } else {
            console.log("Progress bar disabled. Using text updates.");
        }
        // --- End MultiBar Initialization ---


        // --- Process tasks using the semaphore and update bars ---
        processingPromises = rowDataForPromises.map(taskData => {
            return (async () => { // Wrap in async IIFE
                let release = null;
                let bar = null;
                let barIndex = -1;
                const shortUrl = taskData.urlToScrape.length > 60 ? taskData.urlToScrape.substring(0, 57) + '...' : taskData.urlToScrape;

                try {
                    // 1. Acquire Semaphore
                    [, release] = await semaphore.acquire();
                    activeTasks++; // Increment counter *after* acquiring

                    // 2. Acquire Progress Bar Slot
                    if (multiBar) {
                        barIndex = nextBarIndex++ % config.concurrency;
                        bar = taskBars[barIndex];
                        bar.start(1, 0); // Reset bar
                        bar.update(0, { status: 'Starting', url: shortUrl });
                    }

                    // 3. Execute Scraping Task
                    const emails = await scrapeEmails(browser, taskData.urlToScrape, 0, bar);

                    // 4. Update Bar on Success
                    if (bar) bar.update(1, { status: `✅ Done (${emails.length} emails)`, url: shortUrl }); // Mark as 100% complete

                    return { status: 'fulfilled', emails: emails, originalRow: taskData.originalRow };

                } catch (error) {
                    // 5. Update Bar on Error
                    const conciseError = error.message.split('\n')[0];
                    if (bar) bar.update(1, { status: `❌ Error`, url: shortUrl }); // Mark as 100% complete (failed)
                     // Log error below progress bars
                    console.error(`\n[ERROR] Task for ${shortUrl}: ${conciseError}`);
                    recentErrors.unshift(`[${shortUrl}] ${conciseError}`);
                    if(recentErrors.length > MAX_RECENT_ERRORS) recentErrors.pop();

                    return { status: 'rejected', error: conciseError, originalRow: taskData.originalRow, failedUrl: taskData.urlToScrape };
                } finally {
                    // 6. Release Semaphore & Update Counters
                    activeTasks--; // Decrement counter *before* releasing
                    completedTasks++; // Increment overall completed count
                    if (release && typeof release === 'function') {
                        try { release(); }
                        catch (releaseError) { console.error(`\nError releasing semaphore for ${shortUrl}: ${releaseError.message}`); }
                    }
                     // If NOT using multibar, update simple text progress here
                     if (!multiBar && (completedTasks % 10 === 0 || completedTasks === totalTasks)) { // Update every 10 or on last task
                         const percentage = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;
                         process.stdout.write(`\rScraping progress: ${completedTasks}/${totalTasks} tasks completed (${percentage}%) | Active: ${activeTasks} | Errors: ${recentErrors.length}`);
                    }
                }
            })(); // Immediately invoke the async function
        });

        // --- Wait for all mapped promises to settle ---
        const allResults = await Promise.all(processingPromises);


        // --- Stop MultiBar ---
        if (multiBar) {
            multiBar.stop();
            if(recentErrors.length > 0) {
                console.error("\n--- Recent Errors ---");
                recentErrors.forEach(e => console.error(e));
                console.error("--------------------");
            }
        } else {
            // Clear fallback text line
            process.stdout.write(`\rScraping progress: ${completedTasks}/${totalTasks} tasks completed (100.0%) | Active: ${activeTasks} | Errors: ${recentErrors.length}\n`);
        }
        // --- End Stop MultiBar ---

        console.log(`All ${totalTasks} scraping tasks have finished.`);


        // --- Aggregate Results ---
        let fulfilledCount = 0;
        let rejectedCount = 0;
        let emailsAddedCount = 0;
        console.log("Aggregating results...");
        for (const result of allResults) {
             if (result && result.status === 'fulfilled') {
                 fulfilledCount++;
                 const uniqueNewEmails = result.emails.filter(email => !existingEmails.has(email));
                 if (uniqueNewEmails.length > 0) {
                     const newRow = { ...result.originalRow };
                     uniqueNewEmails.forEach((email, index) => {
                         const emailHeader = `Email${index + 1}`;
                         newRow[emailHeader] = email;
                         headersSet.add(emailHeader); // Track new header
                         existingEmails.add(email); // Add to global set
                         emailsAddedCount++;
                     });
                     results.push(newRow);
                 }
             } else if (result && result.status === 'rejected') {
                 rejectedCount++;
                 // Optionally log rejected URLs here if needed for summary
                 // console.warn(` - Failed URL: ${result.failedUrl}`);
             }
        }
        console.log(`Aggregation complete: ${fulfilledCount} successful scrapes, ${rejectedCount} failures.`);
        console.log(`Found ${emailsAddedCount} new unique emails across all sites.`);


        // --- Write Output CSV ---
        if (results.length === 0) {
            console.log("\nNo new emails found matching criteria, or no valid websites processed. Output file will not be created.");
        } else {
            const sortedEmailHeaders = Array.from(headersSet).sort((a, b) => parseInt(a.replace('Email', ''), 10) - parseInt(b.replace('Email', ''), 10));
            const finalHeaders = originalHeaders.concat(sortedEmailHeaders);
            const outputFileName = config.inputFile.replace(/(\.csv)$/i, config.outputFileSuffix);
            console.log(`\nWriting ${results.length} rows with new emails to ${outputFileName}...`);
            const csvWriter = createCsvWriter({ path: outputFileName, header: finalHeaders.map(header => ({ id: header, title: header })), append: false });
            try {
                await csvWriter.writeRecords(results);
                console.log(`CSV file written successfully.`);
            } catch (writeError) {
                console.error(`\nError writing output CSV file '${outputFileName}': ${writeError.message}`);
                console.error("Please check file permissions and available disk space.");
            }
        }

    } catch (error) { // Catch critical errors outside the main loop/Promise.all
        if (multiBar && !multiBar.stop) { multiBar.stop(); } // Ensure bar stops
        console.error('\n--- A critical error occurred during processing ---');
        console.error(error.message); // Log concise message
        console.error("Attempting to close browser if open...");
    } finally {
        if (multiBar && !multiBar.stop) { multiBar.stop(); } // Ensure bar stops if exited early

        // Log final memory usage
        try {
            const freeMem = formatBytes(os.freemem());
            const totalMem = formatBytes(os.totalmem());
            console.log(`System Memory: ${freeMem} free / ${totalMem} total`);
        } catch (memError) { /* ignore */ }

        // Close browser instance
        if (browser) {
            console.log("Closing browser...");
            try { await browser.close(); console.log("Browser closed."); }
            catch(closeError) { console.error(`Error closing browser: ${closeError.message}`); }
        }
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`--- Script finished in ${duration} seconds ---`);
    }
}

// --- Execute the Process ---
processCsv().catch(error => {
    console.error('--- Unhandled top-level error ---');
    if (multiBar && !multiBar.stop) { multiBar.stop(); } // Final safety net for bar
    process.exit(1); // Indicate failure
});