#!/usr/bin/env node

// --- Dependency Check ---
try {
    require.resolve('playwright');
    require.resolve('csv-parser');
    require.resolve('csv-writer');
    require.resolve('async-mutex');
    require.resolve('limiter');
    require.resolve('cli-progress');
    require.resolve('robots-parser');
    require.resolve('yargs');
    // require.resolve('node-fetch'); // Needed if Node < 18 or prefer separate fetch
} catch (e) {
    console.error("Error: Required dependency not found.");
    if (e.message.includes('playwright')) {
        console.error("Please run 'npm install playwright' and then 'npx playwright install'.");
    } else if (e.message.includes('robots-parser') || e.message.includes('yargs')) {
        console.error("Please run 'npm install robots-parser yargs'.");
    // } else if (e.message.includes('node-fetch')) {
    //     console.error("Please run 'npm install node-fetch'."); // If needed
    } else {
        console.error("Please run 'npm install playwright csv-parser csv-writer async-mutex limiter cli-progress robots-parser yargs'."); // Add node-fetch if needed
    }
    console.error("Details:", e.message);
    process.exit(1);
}
// --- End Dependency Check ---

const playwright = require('playwright');
const csv = require('csv-parser');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { URL } = require('url');
const { Semaphore, Mutex } = require('async-mutex');
const { RateLimiter } = require('limiter');
const cliProgress = require('cli-progress');
const os = require('os');
const path = require('path');
const robotsParser = require('robots-parser');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
// Use global fetch if Node >= 18, otherwise install and use 'node-fetch'
// const fetch = require('node-fetch'); // Uncomment if using node-fetch
const dns = require('dns').promises; // For Phase 4 DNS validation

// --- Default Configuration Section ---
const defaultConfig = {
    // --- Basic Settings ---
    inputFile: 'test.csv', // Default input filename
    pageLoadTimeout: 15000,
    maxDepth: 0,
    // ADJUST CONCURRENCY BASED ON YOUR SYSTEM! Start lower (e.g., 4 or os.cpus().length).
    concurrency: os.cpus().length > 2 ? os.cpus().length - 1 : 4,
    websiteColumnName: 'Website',

    // --- Retries ---
    navigationRetries: 2,
    retryDelay: 2000,
    elementActionRetries: 1,
    elementActionRetryDelay: 500,

    // --- Filtering (Loaded from files) ---
    emailFilter: [
        'example.com', 'domain.com', 'sentry.io', 'wixpress.com', 'smblogin.com',
        '@example.', '@email.', '@domain.', 'localhost', 'example.org', 'img', 'image',
        'logo', 'icon', 'sprite', 'info@', 'support@', 'contact@', 'sales@', 'hello@',
        'no-reply@', 'noreply@', 'wix.com', 'godaddy.com', 'squarespace.com',
        'automattic.com', 'google-analytics.com', 'googletagmanager.com',
        'facebook.net', 'fbcdn.net', 'user@localhost'
    ],
    excludedDomains: ['facebook.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'instagram.com', 'pinterest.com', 'google.com', 'maps.google.com', 'docs.google.com', 'javascript:', 'tel:', 'mailto:'],
    excludedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.zip', '.rar', '.exe', '.dmg', '.mp4', '.mp3', '.avi', '.mov', '.css', '.js', '.webp', '.woff', '.woff2', '.ttf', '.eot'],
    excludedPatterns: ['/wp-content/', '/wp-includes/', '/cart/', '/checkout/', '/login', '/register', '/account', '/policy', '/terms', '/privacy', 'blog', 'event', '/events/', '/news/', '/uploads/', '/assets/', '/static/'],

    // --- Performance & Behavior ---
    useRateLimiting: false,
    useUserAgents: true,
    useProxies: false,
    proxyTestUrl: 'https://httpbin.org/ip',
    proxyTestTimeout: 5000,
    browserType: 'chromium',
    headless: true,
    pageWaitUntil: 'domcontentloaded',
    blockResourceTypes: ['image', 'stylesheet', 'font', 'media', 'other', 'websocket', 'fetch', 'eventsource'],
    blockUrlPatterns: [
        'google-analytics.com', 'googletagmanager.com', 'facebook.net', 'doubleclick.net',
        'ads.', 'adservice', 'analytics', '/api/', '.css', '.js', 'track', 'pixel', 'beacon',
        'optimizely', 'hotjar', 'mouseflow', 'segment.com', 'connect.facebook', 'platform.twitter',
        'maps.google', 'maps.googleapis'
    ],
    postLoadDelay: 500,
    waitForSelector: null,
    waitForSelectorTimeout: 5000,
    extractionMethod: 'innerText', // 'innerText', 'content', 'both'
    emailLocationSelectors: [], // e.g., ['#contact', '.email-address']
    minDelayPerDomain: 500,
    contextMaxTasks: 200,
    contextMaxTimeMinutes: 60,

    // --- Lists for Rotation / External Loading ---
    userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    ],
    proxies: [],
    userAgentsFile: 'user_agents.txt',
    proxiesFile: 'proxies.txt',
    emailFilterFile: 'email_filter.txt',
    excludedDomainsFile: 'excluded_domains.txt',
    excludedExtensionsFile: 'excluded_extensions.txt',
    excludedPatternsFile: 'excluded_patterns.txt',
    blocklistPatternsFile: 'blocklist_patterns.txt',

    // --- Output ---
    outputFormat: 'csv', // Primarily affects report delimiter if not CSV
    reportFileSuffix: '_report.csv', // Suffix for the detailed report file
    appendToReportFile: false,    // Whether to append to the report file
    includeOriginalDataInReport: false, // Add original CSV columns to the report?
    emailSeparator: '; ',        // Separator for multiple emails in report cells

    // --- State ---
    stateFile: 'scraper_state.json',

    // --- Progress Reporting ---
    useProgressBar: true,

    // --- Phase 1 Additions ---
    respectRobotsTxt: true,
    userAgentIdentifier: 'EmailScraperBot/1.1 (+http://example.com/bot-info)',

    // --- Phase 2 Additions ---
    detectBlocks: true,
    blockKeywords: ["just a moment", "checking your browser", "captcha", "access denied", "error 403", "verify you are human", "challenge-platform"],
    blockSelectors: ["iframe[src*='recaptcha']", "#cf-challenge-form", "#challenge-stage"],

    // --- Phase 4 Additions ---
    scanShadowDOM: false,
    scanIFrames: false,
    validateDomainMX: false,
    maxIframeScanDepth: 1,

};
// --- End Default Configuration Section ---

// --- Custom Error Classes ---
class BlockDetectedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BlockDetectedError';
    }
}

class ProxyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProxyError';
    }
}

// Simple error class for planned skips to differentiate in catch block
class SkipTaskError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SkipTaskError';
    }
}

// --- Global Variables ---
let config = { ...defaultConfig };
let taskSemaphore = null;
let rateLimiter = null;
let visitedUrls = new Set();
let existingEmails = new Set(); // Unique emails found across the entire run (for report comparison)
let domainRobotsCache = new Map();
let activeTasks = 0;
let recentErrors = [];
const MAX_RECENT_ERRORS = 15;
let multiBar = null;
let taskBars = [];
let availableWorkerIndices = [];
let errorLogStream = null;
const invalidEmailExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.json', '.xml', '.yaml', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.mp4', '.mov', '.avi', '.mp3'];
let reportCsvWriter = null; // For the detailed report output
const writeMutex = new Mutex(); // Protect CSV writing
const domainMutex = new Mutex();
let domainLastRequest = {};
let contextUsage = [];
let domainMxValidityCache = new Map();
let temporaryBlocklist = new Set();
let stateChanged = false;

// --- Utility Functions ---
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return null;
    try {
        urlString = urlString.trim();
        if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
            urlString = 'http://' + urlString;
        }
        const urlObj = new URL(urlString);
        urlObj.pathname = (urlObj.pathname || '/').replace(/\/+$/, '') || '/';
        urlObj.hash = '';
        urlObj.search = '';
        return urlObj.toString();
    } catch (e) {
        return null;
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function loadListFromFile(filePath, baseDir = __dirname) {
    try {
        const absolutePath = path.resolve(baseDir, filePath);
        if (fs.existsSync(absolutePath)) {
            const content = fs.readFileSync(absolutePath, 'utf8');
            const lines = content.split(/\r?\n/)
                               .map(line => line.trim().toLowerCase())
                               .filter(line => line && !line.startsWith('#'));
            return lines;
        }
    } catch (e) {
        console.warn(`Warning: Could not load list from ${filePath}: ${e.message}`);
    }
    return [];
}

// --- Phase 1: robots.txt Logic ---
async function getRobotsForUrl(urlForDomain, botUserAgent) {
    let domain, origin;
    try {
        const urlObj = new URL(urlForDomain);
        domain = urlObj.hostname;
        origin = urlObj.origin;
    } catch (e) { return null; }

    if (domainRobotsCache.has(domain)) {
        return domainRobotsCache.get(domain);
    }

    const robotsUrl = `${origin}/robots.txt`;
    const fetchPromise = (async () => {
        try {
            const response = await fetch(robotsUrl, {
                method: 'GET',
                headers: { 'User-Agent': botUserAgent },
                redirect: 'follow',
                timeout: 5000,
            });
            if (!response.ok) return null;
            const txt = await response.text();
            return robotsParser(robotsUrl, txt);
        } catch (err) {
            return null;
        }
    })();
    domainRobotsCache.set(domain, fetchPromise);
    return fetchPromise;
}

async function isAllowedByRobots(urlToCheck, botUserAgent) {
    if (!config.respectRobotsTxt) return true;
    try {
        const robots = await getRobotsForUrl(urlToCheck, botUserAgent);
        return robots ? robots.isAllowed(urlToCheck, botUserAgent) : true;
    } catch (e) {
        console.error(`[ROBOTS_FATAL] Error checking robots for ${urlToCheck}: ${e.message}`);
        return true;
    }
}

// --- Phase 2: Proxy Check ---
async function checkProxy(proxyUrl) {
    // Placeholder - reliable check is complex and often done by trying to use it
    if (!config.useProxies || !proxyUrl) return true;
    return true;
}

// --- Phase 5: State Management ---
function saveState() {
    if (!stateChanged) return;
    console.log(`\n[STATE] Saving visited URLs (${visitedUrls.size}) to ${config.stateFile}...`);
    try {
        const stateData = JSON.stringify({ visitedUrls: Array.from(visitedUrls) });
        fs.writeFileSync(config.stateFile, stateData, 'utf8');
        stateChanged = false;
        console.log("[STATE] State saved successfully.");
    } catch (error) {
        console.error(`[STATE_ERROR] Failed to save state to ${config.stateFile}: ${error.message}`);
    }
}

function loadState() {
    if (fs.existsSync(config.stateFile)) {
        console.log(`[STATE] Loading state from ${config.stateFile}...`);
        try {
            const stateData = fs.readFileSync(config.stateFile, 'utf8');
            const parsedState = JSON.parse(stateData);
            if (parsedState.visitedUrls && Array.isArray(parsedState.visitedUrls)) {
                visitedUrls = new Set(parsedState.visitedUrls);
                console.log(`[STATE] Loaded ${visitedUrls.size} visited URLs.`);
            } else {
                console.warn(`[STATE_WARN] Invalid format in ${config.stateFile}. Starting fresh.`);
            }
        } catch (error) {
            console.error(`[STATE_ERROR] Failed to load or parse state from ${config.stateFile}: ${error.message}. Starting fresh.`);
            visitedUrls.clear();
        }
    } else {
        console.log("[STATE] No state file found. Starting fresh.");
    }
}

// --- Core Scraping Logic ---
/**
 * Scrapes a given URL for email addresses.
 * Returns a detailed result object for reporting.
 */
async function scrapeEmails(context, url, depth, bar, workerId) {
    const normalizedUrl = normalizeUrl(url); // Already normalized by caller, but good practice
    const shortUrl = url.length > 70 ? url.substring(0, 67) + '...' : url;
    let page = null;
    let pageTitle = ''; // Initialize page title
    let emailsFoundOnPage = []; // Emails found specifically on this page load
    let finalEmailsAfterMX = []; // Emails after MX validation (if enabled)

    try {
        const urlObj = new URL(normalizedUrl);

        // --- Pre-checks (Some done by caller, defensive checks here) ---
        // Note: Caller (runScrapingTasks) now handles robots & visited checks primarily,
        // throwing SkipTaskError to trigger writing the report row correctly.
        // These internal checks are secondary safety.
        if (visitedUrls.has(normalizedUrl)) {
            throw new SkipTaskError('Skipped (Already Visited - internal check)');
        }
        if (config.excludedDomains.some(domain => urlObj.hostname.toLowerCase().includes(domain.toLowerCase()))) {
             throw new SkipTaskError(`Skipped (Excluded Domain: ${urlObj.hostname})`);
        }
        if (temporaryBlocklist.has(urlObj.hostname)) {
            throw new SkipTaskError('Skipped (Domain Temporarily Blocked)');
        }

        // Mark as visited *before* async ops for this URL
        visitedUrls.add(normalizedUrl);
        stateChanged = true;

        // --- Phase 3: Per-Domain Rate Limiting ---
        if (config.minDelayPerDomain > 0) {
            const hostname = urlObj.hostname;
            const releaseDomain = await domainMutex.acquire();
            try {
                const lastRequestTime = domainLastRequest[hostname] || 0;
                const now = Date.now();
                const timeSinceLast = now - lastRequestTime;
                if (timeSinceLast < config.minDelayPerDomain) {
                    const delayNeeded = config.minDelayPerDomain - timeSinceLast;
                    if (bar) bar.update({ status: `WKR-${workerId} DELAY ${delayNeeded}ms`, url: shortUrl });
                    await sleep(delayNeeded);
                }
                domainLastRequest[hostname] = Date.now();
            } finally {
                releaseDomain();
            }
        }

        if (bar) bar.update({ status: `WKR-${workerId} PAGE`, url: shortUrl });
        if (config.useRateLimiting && rateLimiter) {
            await rateLimiter.removeTokens(1);
        }

        // Create Page
        page = await context.newPage();

        // Resource Blocking
        if (bar) bar.update({ status: `WKR-${workerId} BLOCK`, url: shortUrl });
        await page.route('**/*', (route) => {
            const request = route.request();
            const type = request.resourceType().toLowerCase();
            const reqUrl = request.url().toLowerCase();
            const blockTypesLower = config.blockResourceTypes.map(rt => rt.toLowerCase());
            const blockPatternsLower = config.blockUrlPatterns.map(p => p.toLowerCase());

            if (blockTypesLower.includes(type)) return route.abort('blockedbyclient').catch(() => {});
            if (blockPatternsLower.some(pattern => reqUrl.includes(pattern))) return route.abort('blockedbyclient').catch(() => {});
            return route.continue().catch(() => {});
        });

        // Navigation with Retries
        let navigationResponse = null;
        for (let attempt = 0; attempt <= config.navigationRetries; attempt++) {
            try {
                if (bar) bar.update({ status: `WKR-${workerId} NAV ${attempt + 1}`, url: shortUrl });
                navigationResponse = await page.goto(normalizedUrl, { timeout: config.pageLoadTimeout, waitUntil: config.pageWaitUntil });
                break;
            } catch (error) {
                const isTimeout = error.message.includes('Timeout');
                const isNetError = error.message.includes('net::') || error.message.includes('NS_ERROR_');
                const isProxyError = error.message.includes('proxy') || error.message.includes('tunnel');

                if (isProxyError && config.useProxies) {
                    // Throw specific error, handled by caller
                    throw new ProxyError(`[PROXY_NAV_FAIL] WKR-${workerId} (${attempt + 1}): ${error.message}`);
                }
                if ((isTimeout || isNetError) && attempt < config.navigationRetries) {
                    if (bar) bar.update({ status: `WKR-${workerId} RETRY ${attempt + 1}`, url: shortUrl });
                    await sleep(config.retryDelay * (attempt + 1));
                } else {
                    // Throw generic navigation error
                    throw new Error(`[NAV_FAIL] WKR-${workerId} (${attempt + 1}): ${error.message}`);
                }
            }
        }
        if (!navigationResponse) { // Should have been thrown above, but safeguard
             throw new Error(`[NAV_FAIL_FINAL] WKR-${workerId}: Failed after ${config.navigationRetries + 1} attempts for ${shortUrl}.`);
        }

        // --- Phase 2: Block Detection ---
        if (config.detectBlocks) {
            let isBlocked = false; let blockReason = '';
            try {
                const currentTitle = (await page.title() || '').toLowerCase();
                const pageContentSample = (await page.locator('body').innerText({ timeout: 2000 }) || '').toLowerCase().substring(0, 500);
                for (const keyword of config.blockKeywords) {
                    if (currentTitle.includes(keyword) || pageContentSample.includes(keyword)) { isBlocked = true; blockReason = `Keyword match: "${keyword}"`; break; }
                }
                if (!isBlocked) {
                    for (const selector of config.blockSelectors) {
                        try { if (await page.locator(selector).count() > 0) { isBlocked = true; blockReason = `Selector match: "${selector}"`; break; } }
                        catch (locatorError) { /* Ignore */ }
                    }
                }
            } catch (e) { console.warn(`\n[BLOCK_DETECT_WARN] WKR-${workerId} Error checking for blocks on ${shortUrl}: ${e.message.split('\n')[0]}`); }

            if (isBlocked) {
                temporaryBlocklist.add(urlObj.hostname);
                // Throw specific error, handled by caller
                throw new BlockDetectedError(`[BLOCK_DETECTED] WKR-${workerId} on ${shortUrl}. Reason: ${blockReason}`);
            }
        }

        // --- Extract Page Title (Best Effort) ---
        try {
             pageTitle = await page.title();
        } catch (titleError) {
             console.warn(`\n[TITLE_WARN] WKR-${workerId} Could not get title for ${url}: ${titleError.message.split('\n')[0]}`);
             pageTitle = 'Error Retrieving Title';
        }

        // Post-Load Waits
        if (bar) bar.update({ status: `WKR-${workerId} WAIT`, url: shortUrl });
        try {
            if (config.postLoadDelay > 0) await sleep(config.postLoadDelay);
            if (config.waitForSelector) await page.waitForSelector(config.waitForSelector, { timeout: config.waitForSelectorTimeout, state: 'visible' });
        } catch (waitError) { console.warn(`\n[WAIT_WARN] WKR-${workerId} for ${shortUrl}: ${waitError.message.split('\n')[0]}`); }

        // Extract Content
        if (bar) bar.update({ status: `WKR-${workerId} EXTRACT`, url: shortUrl });
        let content = ''; let extractedViaSelectors = false;
        if (config.emailLocationSelectors && config.emailLocationSelectors.length > 0) {
            const selectorContents = [];
            for (const selector of config.emailLocationSelectors) {
                try { const texts = await page.locator(selector).allInnerTexts(); if (texts && texts.length > 0) selectorContents.push(...texts); }
                catch (selectorError) { /* Ignore */ }
            }
            if (selectorContents.length > 0) { content = selectorContents.join('\n'); extractedViaSelectors = true; if (bar) bar.update({ status: `WKR-${workerId} EXTRACT (Selectors)`, url: shortUrl }); }
        }
        if (!extractedViaSelectors) {
            if (bar) bar.update({ status: `WKR-${workerId} EXTRACT (${config.extractionMethod})`, url: shortUrl });
            for (let attempt = 0; attempt <= config.elementActionRetries; attempt++) {
                 try {
                     if (config.extractionMethod === 'innerText') content = await page.locator('body').innerText({ timeout: 15000 });
                     else if (config.extractionMethod === 'both') {
                         const htmlContent = await page.content({ timeout: 15000 });
                         let textContent = ''; try { textContent = await page.locator('body').innerText({ timeout: 15000 }); } catch { /* ignore */ }
                         content = htmlContent + "\n" + textContent;
                     } else content = await page.content({ timeout: 15000 });
                     break;
                 } catch (contentError) {
                     if (attempt < config.elementActionRetries) await sleep(config.elementActionRetryDelay);
                     else { console.warn(`\n[CONTENT_EXTRACT_WARN] WKR-${workerId} for ${shortUrl} after ${attempt + 1} attempts: ${contentError.message.split('\n')[0]}`); content = ''; }
                 }
            }
        }

        // --- Phase 4: Scan iFrames and Shadow DOM (Experimental) ---
        let additionalContent = '';
        if (config.scanShadowDOM) {
            if (bar) bar.update({ status: `WKR-${workerId} EXTRACT (Shadow DOM)`, url: shortUrl });
            try {
                const shadowContent = await page.evaluate(() => {
                    let text = '';
                    function extractTextFromNode(node) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            text += node.textContent + '\n';
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check for shadow root
                            if (node.shadowRoot) {
                                extractTextFromNode(node.shadowRoot); // Recurse into shadow root
                            }
                            // Recurse into children
                            for (const child of node.childNodes) {
                                extractTextFromNode(child);
                            }
                        } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                             // Handle shadow root content (which is a DocumentFragment)
                             for (const child of node.childNodes) {
                                 extractTextFromNode(child);
                             }
                        }
                    }
                    extractTextFromNode(document.body); // Start from the body
                    return text;
                });
                if (shadowContent) {
                    content += "\n" + shadowContent;
                }
            } catch (shadowError) {
                console.warn(`\n[SHADOW_EXTRACT_WARN] WKR-${workerId} for ${shortUrl}: ${shadowError.message.split('\n')[0]}`);
            }
        }
        if (config.scanIFrames) {
             try { if (bar) bar.update({ status: `WKR-${workerId} EXTRACT (iFrames)`, url: shortUrl }); additionalContent += await extractFromFrames(page, config.maxIframeScanDepth); }
             catch (iframeError) { console.warn(`\n[IFRAME_EXTRACT_WARN] WKR-${workerId} for ${shortUrl}: ${iframeError.message.split('\n')[0]}`); }
        }
        if (additionalContent) content += "\n" + additionalContent;

        // --- Scan for Emails ---
        if (bar) bar.update({ status: `WKR-${workerId} SCAN`, url: shortUrl });
        const foundEmailsSet = new Set(); // Use a set for uniqueness *within this page*
        if (content) {
            const emailRegex = /[a-zA-Z0-9._%+-]+(?:@|\s*\[\s*at\s*]\s*)[a-zA-Z0-9.-]+(?:\.|\s*\[\s*dot\s*]\s*)[a-zA-Z]{2,}/gi;
            let emailMatches = content.match(emailRegex);
            if (emailMatches) {
                emailMatches.forEach(rawEmail => {
                    let email = rawEmail.toLowerCase().trim().replace(/\s*\[\s*at\s*]\s*/g, '@').replace(/\s*\[\s*dot\s*]\s*/g, '.').replace(/\s+/g, '').replace(/\.$/, '');
                    if (invalidEmailExtensions.some(ext => email.endsWith(ext))) return;
                    if (config.emailFilter.some(filter => email.includes(filter))) return;
                    const parts = email.split('@'); if (parts.length !== 2 || parts[0].length < 1 || parts[1].length < 3 || !parts[1].includes('.')) return;
                    const domainParts = parts[1].split('.'); if (domainParts.length < 2 || domainParts[domainParts.length-1].length < 2 || domainParts[domainParts.length-1].length > 10) return;
                    if (email.length > 254) return;
                    foundEmailsSet.add(email);
                });
            }
             try { // Data attributes
                  const dataEmails = await page.evaluate(() => {
                       const emails = new Set(); document.querySelectorAll('[data-email]').forEach(el => { const attrVal = el.getAttribute('data-email'); if (attrVal && attrVal.includes('@') && attrVal.includes('.')) emails.add(attrVal.toLowerCase().trim()); }); return Array.from(emails);
                  });
                  if (dataEmails && dataEmails.length > 0) {
                       dataEmails.forEach(email => {
                            email = email.replace(/\.$/, ''); if (invalidEmailExtensions.some(ext => email.endsWith(ext))) return; if (config.emailFilter.some(filter => email.includes(filter))) return; const parts = email.split('@'); if (parts.length !== 2 || parts[0].length < 1 || parts[1].length < 3 || !parts[1].includes('.')) return; const domainParts = parts[1].split('.'); if (domainParts.length < 2 || domainParts[domainParts.length-1].length < 2 || domainParts[domainParts.length-1].length > 10) return; if (email.length > 254) return;
                            foundEmailsSet.add(email);
                       });
                  }
             } catch (evalError) { console.warn(`\n[DATA_ATTR_EVAL_WARN] WKR-${workerId} for ${shortUrl}: ${evalError.message.split('\n')[0]}`); }
        }
        emailsFoundOnPage = Array.from(foundEmailsSet); // Convert set to array for this page's raw findings
        finalEmailsAfterMX = [...emailsFoundOnPage]; // Initialize with raw found emails for MX check

        // --- Phase 4: DNS MX Validation ---
        if (config.validateDomainMX && finalEmailsAfterMX.length > 0) {
             if (bar) bar.update({ status: `WKR-${workerId} DNS MX`, url: shortUrl });
             const domainsToCheck = new Set(finalEmailsAfterMX.map(email => email.split('@')[1]));
             for (const domain of domainsToCheck) {
                 if (domainMxValidityCache.has(domain)) continue;
                 try {
                     await sleep(50); const mxRecords = await dns.resolveMx(domain); domainMxValidityCache.set(domain, (mxRecords && mxRecords.length > 0));
                 } catch (dnsError) {
                     if (dnsError.code !== 'ENOTFOUND' && dnsError.code !== 'ENODATA') console.warn(`\n[DNS_WARN] WKR-${workerId} MX lookup failed for ${domain}: ${dnsError.code || dnsError.message}`);
                     domainMxValidityCache.set(domain, false);
                 }
             }
             finalEmailsAfterMX = finalEmailsAfterMX.filter(email => domainMxValidityCache.get(email.split('@')[1]) === true);
        }

        // --- Crawl Links ---
        if (depth < config.maxDepth) {
            if (bar) bar.update({ status: `WKR-${workerId} LINKS`, url: shortUrl });
            let links = [];
             for (let attempt = 0; attempt <= config.elementActionRetries; attempt++) {
                 try { links = await page.$$eval('a[href]', anchors => anchors.map(a => a.href).filter(href => href)); break; }
                 catch (evalError) { if (attempt < config.elementActionRetries) await sleep(config.elementActionRetryDelay); else console.warn(`\n[LINK_EVAL_WARN] WKR-${workerId} on ${shortUrl} after ${attempt+1} attempts: ${evalError.message.split('\n')[0]}`); }
             }
            const urlsToCrawl = new Set();
            if (links.length > 0) {
                const baseUrlObj = new URL(normalizedUrl);
                for (const link of links) {
                    try {
                        const absoluteUrl = new URL(link, baseUrlObj.href).toString(); const normalizedLinkUrl = normalizeUrl(absoluteUrl);
                        if (!normalizedLinkUrl || normalizedLinkUrl === normalizedUrl || visitedUrls.has(normalizedLinkUrl)) continue;
                        const linkUrlObj = new URL(normalizedLinkUrl); if (!['http:', 'https:'].includes(linkUrlObj.protocol)) continue;
                        if (temporaryBlocklist.has(linkUrlObj.hostname)) continue;
                        if (config.excludedDomains.some(domain => linkUrlObj.hostname.toLowerCase().includes(domain))) continue;
                        const pathnameLower = linkUrlObj.pathname.toLowerCase(); if (config.excludedExtensions.some(ext => pathnameLower.endsWith(ext))) continue;
                        if (config.excludedPatterns.some(pattern => pathnameLower.includes(pattern))) continue;
                        const isSubLinkAllowed = await isAllowedByRobots(normalizedLinkUrl, config.userAgentIdentifier);
                        if (!isSubLinkAllowed) { visitedUrls.add(normalizedLinkUrl); stateChanged = true; continue; }
                        urlsToCrawl.add(normalizedLinkUrl);
                    } catch (urlError) { /* Ignore link resolution */ }
                }
            }
            if (urlsToCrawl.size > 0) {
                if (bar) bar.update({ status: `WKR-${workerId} CRAWL (${urlsToCrawl.size})`, url: shortUrl });
                const childPromises = Array.from(urlsToCrawl).map(newUrl =>
                    // Recursive call - errors handled below, result used to populate global emails
                    scrapeEmails(context, newUrl, depth + 1, null, workerId)
                    .then(childResult => childResult.finalEmailsAfterMX || []) // Return emails found by child
                    .catch(childError => {
                        const conciseChildError = childError.message.split('\n')[0];
                        // Log sub-task errors, but don't crash parent. Child task will write its own report row.
                        console.error(`\n[SUB_TASK_ERROR] WKR-${workerId} Crawling ${newUrl} from ${shortUrl}: ${conciseChildError}`);
                        if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [SUB_TASK] Parent: ${url} Child: ${newUrl} Error: ${conciseChildError}\n`);
                        if (childError instanceof BlockDetectedError) { try { temporaryBlocklist.add(new URL(newUrl).hostname); } catch {} }
                        return []; // Return empty array on sub-task failure
                    })
                );
                 // Wait for children, but primary purpose is for them to update global state/write reports.
                 // We don't merge their emails into the *parent's* report row here.
                await Promise.all(childPromises);
            }
        }

        if (bar) bar.update({ status: `WKR-${workerId} Done (${finalEmailsAfterMX.length})`, url: shortUrl });

        // Return detailed results for *this specific page*
        return {
            status: 'success', // Indicates scrape attempt itself didn't throw an error
            pageTitle: pageTitle,
            emailsFoundRaw: emailsFoundOnPage, // Before MX validation
            finalEmailsAfterMX: finalEmailsAfterMX // After MX validation (if enabled)
        };

    } catch (error) {
        // Re-throw specific errors or wrap generic ones for the caller (runScrapingTasks) to handle
        if (error instanceof BlockDetectedError ||
            error instanceof ProxyError ||
            error instanceof SkipTaskError) {
            throw error; // Pass specific errors up
        }
        // Wrap other errors if they don't have a specific type/prefix
        const errorMessage = error.message || 'Unknown error';
         throw new Error(`[SCRAPE_FAIL] WKR-${workerId}: ${errorMessage}`); // Ensure it's categorized

    } finally {
        // Ensure page is closed even on error
        if (page) {
            try { await page.close(); } catch (e) { /* Ignore page close errors */ }
        }
    }
}

// --- Phase 4: Helper for iFrame Extraction ---
async function extractFromFrames(pageOrFrame, maxDepth, currentDepth = 0) {
    if (currentDepth > maxDepth) return '';
    let frameText = '';
    const frames = pageOrFrame.frames();
    for (const frame of frames) {
        try {
            await frame.evaluate(() => void(0), { timeout: 500 });
            try { frameText += await frame.locator('body').innerText({ timeout: 5000 }) + '\n'; }
            catch { /* ignore body text fail */ }
            frameText += await extractFromFrames(frame, maxDepth, currentDepth + 1);
        } catch (frameAccessError) {
            // console.warn(`[IFRAME_ACCESS_WARN] Skipping frame: ${frameAccessError.message.split('\n')[0]}`);
        }
    }
    return frameText;
}


// --- Refactored Main Logic Functions ---

/**
 * Initializes browser, contexts, state, logging.
 */
async function initialize(cfg) {
    let browser = null;
    let browserContexts = [];
    let localErrorLogStream = null;

    try {
        localErrorLogStream = fs.createWriteStream('errors.log', { flags: 'a' });
        errorLogStream = localErrorLogStream;
        localErrorLogStream.write(`\n--- Log Start: ${new Date().toISOString()} ---\n`);
        localErrorLogStream.write(`Config: ${JSON.stringify(cfg, null, 2)}\n`);
    } catch (logError) {
        console.error(`FATAL: Could not open errors.log for writing: ${logError.message}`);
        throw logError;
    }

    loadState();

    console.log("Launching browser...");
    try {
        browser = await playwright[cfg.browserType].launch({ headless: cfg.headless });
        browser.on('disconnected', () => {
            console.error(`\n[FATAL_BROWSER_DISCONNECT] Browser disconnected unexpectedly! System likely under heavy load.`);
            if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [FATAL_BROWSER_DISCONNECT]\n`);
            // Attempt to stop progress bar before exiting
            if (multiBar && !multiBar.stop) try { multiBar.stop(); } catch {}
            process.exit(1); // Exit immediately on disconnect
        });
        console.log("Browser launched successfully.");
    } catch (launchError) {
        console.error(`\nFATAL ERROR: Launching browser (${cfg.browserType}): ${launchError.message}`);
        if (localErrorLogStream) localErrorLogStream.write(`[FATAL_LAUNCH] ${launchError.stack}\n`);
        throw launchError;
    }

    console.log(`Initializing ${cfg.concurrency} browser contexts...`);
    contextUsage = [];
    try {
        for (let i = 0; i < cfg.concurrency; i++) {
            let proxyServer = undefined;
            if (cfg.useProxies && cfg.proxies.length > 0) {
                const proxy = cfg.proxies[i % cfg.proxies.length];
                proxyServer = { server: proxy };
            }
            const contextOptions = {
                javaScriptEnabled: true, ignoreHTTPSErrors: true,
                userAgent: (cfg.useUserAgents && cfg.userAgents.length > 0) ? cfg.userAgents[i % cfg.userAgents.length] : undefined,
                proxy: proxyServer,
            };
            const context = await browser.newContext(contextOptions);
             context.on('close', () => {
                  // This is often a symptom of the browser crashing due to resource limits
                  console.warn(`[CONTEXT_CLOSE_WARN] Context ${i} closed unexpectedly. Possible resource issue.`);
                  if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [CONTEXT_CLOSE_WARN] Context ${i}\n`);
                  if(browserContexts[i]) browserContexts[i] = null; // Mark as closed
             });
            browserContexts.push(context);
            contextUsage.push({ tasks: 0, startTime: Date.now() });
        }
        console.log("Browser contexts initialized.");
        availableWorkerIndices = Array.from({ length: cfg.concurrency }, (_, i) => i);
    } catch (contextInitError) {
         console.error(`\nFATAL ERROR: Initializing browser contexts: ${contextInitError.message}`);
         if (localErrorLogStream) localErrorLogStream.write(`[FATAL_CONTEXT_INIT] ${contextInitError.stack}\n`);
         throw contextInitError;
    }

    return { browser, browserContexts, errorLogStream: localErrorLogStream };
}

/**
 * Reads the input CSV, returns tasks and original headers.
 */
async function readAndPrepareTasks(cfg) {
    const rowDataForPromises = [];
    let rowsProcessed = 0;
    let originalHeaders = [];

    const inputFilePath = path.resolve(__dirname, cfg.inputFile);
    if (!fs.existsSync(inputFilePath)) throw new Error(`Input file not found: "${inputFilePath}"`);

    console.log(`Reading CSV file "${inputFilePath}"...`);
    try {
        await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(inputFilePath);
            const parser = csv();
            readStream.on('error', (err) => reject(new Error(`Cannot read input file: ${err.message}`)));
            parser.on('error', (err) => reject(new Error(`CSV parsing error: ${err.message}`)));
            parser.on('headers', (hdrs) => {
                originalHeaders = hdrs;
                if (!originalHeaders.includes(cfg.websiteColumnName)) reject(new Error(`CSV must contain '${cfg.websiteColumnName}' column.`));
            });
            parser.on('end', resolve);
            parser.on('close', resolve);

            readStream.pipe(parser).on('data', (row) => {
                rowsProcessed++;
                const website = row[cfg.websiteColumnName] ? String(row[cfg.websiteColumnName]).trim() : '';
                const urlToScrape = normalizeUrl(website);

                if (urlToScrape && !visitedUrls.has(urlToScrape)) {
                    rowDataForPromises.push({ originalRow: row, urlToScrape: urlToScrape });
                } else if (urlToScrape && visitedUrls.has(urlToScrape)) {
                    // It will be skipped later and reported
                } else if (website) {
                    console.warn(`\n[WARN] Skipping row ${rowsProcessed}: Invalid URL in '${cfg.websiteColumnName}': "${website}"`);
                    if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [SKIP_INVALID_URL] Row ${rowsProcessed}: "${website}"\n`);
                    // TODO: Optionally write invalid URLs to the report? Maybe add a status 'Invalid Input'.
                }
             });
        });

        const totalTasks = rowDataForPromises.length;
        console.log(`Finished reading CSV (${rowsProcessed} rows). Found ${totalTasks} valid, non-visited URLs to scrape.`);
        if (totalTasks === 0 && rowsProcessed > 0) console.log("All URLs from input file were already visited (from state file) or invalid.");
        else if (totalTasks === 0) console.log("No valid URLs found to process.");
        return { rowDataForPromises, originalHeaders };

    } catch (error) {
        console.error(`\nFATAL ERROR during CSV processing: ${error.message}`);
        if (errorLogStream) errorLogStream.write(`[FATAL_CSV_PROCESS] ${error.stack}\n`);
        throw error;
    }
}

/**
 * Initializes the CSV writer for the detailed report.
 * Returns the calculated header array.
 */
function initializeReportWriter(cfg, originalHeaders) {
    // Define headers first, regardless of whether the writer exists
    const reportHeadersBase = [
        { id: 'InputURL', title: 'InputURL' },
        { id: 'NormalizedURL', title: 'NormalizedURL' },
        { id: 'Status', title: 'Status' }, // Success, Error, Skipped, Blocked, Proxy Error
        { id: 'StatusDetail', title: 'StatusDetail' }, // Error message, Skip reason, email count info
        { id: 'Timestamp', title: 'Timestamp' }, // ISO timestamp
        { id: 'PageTitle', title: 'PageTitle' },
        { id: 'EmailsFoundRaw', title: 'EmailsFoundRaw' }, // All emails found on page (before MX), separated by emailSeparator
        { id: 'NewUniqueEmailsAdded', title: 'NewUniqueEmailsAdded' }, // Newly added unique emails (this run), separated
        { id: 'UserAgentUsed', title: 'UserAgentUsed' },
        { id: 'ProxyUsed', title: 'ProxyUsed' },
        { id: 'WorkerID', title: 'WorkerID' },
    ];

    let finalReportHeaders = [...reportHeadersBase];

    if (cfg.includeOriginalDataInReport && originalHeaders && originalHeaders.length > 0) {
        originalHeaders.forEach(header => {
             // Define the key for the report object
            const reportKey = `Original_${header}`;
            // Check if this header corresponds to the input URL column
            if (header === cfg.websiteColumnName) {
                 // Only add if the base InputURL doesn't already cover it (usually does)
                 // This logic might need refinement based on exact desired output for original URL col
                 // Let's assume InputURL covers it, so we skip adding Original_Website if names match
            } else {
                 finalReportHeaders.push({ id: reportKey, title: reportKey });
            }
        });
         // Optional: Explicitly add Original_<websiteColumnName> if needed, even if name matches InputURL
         // if (originalHeaders.includes(cfg.websiteColumnName) && !finalReportHeaders.some(h => h.id === `Original_${cfg.websiteColumnName}`)) {
         //     finalReportHeaders.push({ id: `Original_${cfg.websiteColumnName}`, title: `Original_${cfg.websiteColumnName}` });
         // }
    }

    // Now, proceed with writer initialization if not already done
    if (reportCsvWriter) return finalReportHeaders; // Already initialized, just return headers

    const inputDir = path.dirname(path.resolve(__dirname, cfg.inputFile));
    const inputFilenameBase = path.basename(cfg.inputFile, path.extname(cfg.inputFile));
    const reportFileName = path.join(inputDir, `${inputFilenameBase}${cfg.reportFileSuffix}`);

    let writeHeaderFlag = true;
    if (cfg.appendToReportFile && fs.existsSync(reportFileName)) {
        try {
            const stats = fs.statSync(reportFileName);
            if (stats.size > 0) writeHeaderFlag = false;
        } catch { /* ignore */ }
    }

    console.log(`Initializing report writer for ${reportFileName}. Append: ${cfg.appendToReportFile}, Write Header: ${writeHeaderFlag}`);

    try {
        reportCsvWriter = createCsvWriter({
            path: reportFileName,
            header: finalReportHeaders, // Use the headers defined above
            append: cfg.appendToReportFile && !writeHeaderFlag,
            writeHeaders: writeHeaderFlag,
            alwaysQuote: true, // Important for handling potential separators in data
            fieldDelimiter: cfg.outputFormat === 'csv' ? ',' : '\t', // Support TSV etc. if needed
            recordDelimiter: '\n'
        });
        console.log("Report writer initialized successfully.");
        return finalReportHeaders; // Return headers on successful initialization
    } catch (error) {
         console.error(`FATAL: Could not initialize report writer for ${reportFileName}: ${error.message}`);
         if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [FATAL_REPORT_INIT] File: ${reportFileName} Error: ${error.stack}\n`);
         throw error;
    }
}

/**
 * Writes a detailed result row to the report CSV stream.
 * Accepts the reportHeaders array as an argument.
 */
async function writeReportRow(cfg, reportData, reportHeaders) {
    // Check if writer object exists
    if (!reportCsvWriter) {
        console.error("[REPORT WRITE_ERROR] Report writer object not available! Skipping write for:", reportData.NormalizedURL || reportData.InputURL);
        return;
    }
     // Check if the passed headers array is valid
    if (!reportHeaders || !Array.isArray(reportHeaders) || reportHeaders.length === 0) {
        console.error("[REPORT WRITE_ERROR] Invalid or empty headers passed to writeReportRow! Skipping write for:", reportData.NormalizedURL || reportData.InputURL);
        return;
    }

    const finalRow = {};
    // Use the passed reportHeaders array to structure the row
    reportHeaders.forEach(headerInfo => {
        if (reportData.hasOwnProperty(headerInfo.id)) {
            let value = reportData[headerInfo.id];
            if (typeof value === 'string') {
                 // Basic sanitization: remove newlines which break CSV rows
                 value = value.replace(/[\r\n]+/g, ' ');
            }
            finalRow[headerInfo.id] = value;
        } else {
            finalRow[headerInfo.id] = ''; // Ensure all header columns exist in the output row
        }
    });

    const release = await writeMutex.acquire();
    try {
        // Write the single structured record
        await reportCsvWriter.writeRecords([finalRow]);
    } catch (writeError) {
        console.error(`\n[REPORT WRITE_ERROR] Failed writing row for ${reportData.NormalizedURL || reportData.InputURL}: ${writeError.message}`);
        if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [FATAL_REPORT_WRITE] URL: ${reportData.NormalizedURL || reportData.InputURL} Error: ${writeError.stack}\n`);
        // Decide if this should be fatal? Usually better to try and continue.
    } finally {
        release();
    }
}


/**
 * Runs scraping tasks, handles concurrency, retries, context restarts, streaming output.
 * Accepts the reportHeaders array as an argument.
 */
async function runScrapingTasks(cfg, browser, browserContexts, localErrorLogStream, rowDataForPromises, reportHeaders) {
    const totalTasks = rowDataForPromises.length;
    if (totalTasks === 0) return { successCount: 0, failCount: 0, skippedCount: 0 };

    errorLogStream = localErrorLogStream;
    multiBar = null; taskBars = []; let nextBarIndex = 0;
    recentErrors = []; activeTasks = 0; let completedTasks = 0;
    let successCount = 0; let failCount = 0; let skippedCount = 0; // failCount includes errors/blocks/proxy fails
    const startTime = Date.now();

    taskSemaphore = new Semaphore(availableWorkerIndices.length);
    rateLimiter = cfg.useRateLimiting ? new RateLimiter({ tokensPerInterval: cfg.concurrency, interval: 'second' }) : null;

    if (cfg.useProgressBar && totalTasks > 0) {
        const barFormat = ' {bar} | {percentage}% | {value}/{total} | OK:{success} Err:{fail} Skip:{skipped} | D:{duration_formatted} | ETA:{eta_formatted} | WKR:{workerId} {status} {url}';
        multiBar = new cliProgress.MultiBar({ format: barFormat, clearOnComplete: false, hideCursor: true, barCompleteChar: '\u2588', barIncompleteChar: '\u2591', forceRedraw: true, autopadding: true }, cliProgress.Presets.shades_classic);
        for(let i = 0; i < cfg.concurrency; i++) taskBars.push(multiBar.create(totalTasks, 0, { status: 'Idle', url: '', success: 0, fail: 0, skipped: 0, workerId: 'N/A' }));
        console.log("Progress bar initialized.");
    } else { console.log("Progress bar disabled. Using text updates."); }

    console.log(`Starting ${totalTasks} scraping tasks with concurrency ${availableWorkerIndices.length}...`);

    const processingPromises = rowDataForPromises.map((taskData) => {
        return (async () => {
            let release = null; let bar = null; let barIndex = -1;
            let workerId = -1; let workerCtx = null;
            let userAgentUsed = 'N/A'; let proxyUsed = '';

            const originalInputUrl = taskData.originalRow[cfg.websiteColumnName] || taskData.urlToScrape;
            const url = taskData.urlToScrape;
            const shortUrl = url.length > 70 ? url.substring(0, 67) + '...' : url;

            // Prepare data for the report row - populate knowns early
            const reportData = {
                InputURL: originalInputUrl, NormalizedURL: url, Status: 'Pending', StatusDetail: '',
                Timestamp: new Date().toISOString(), PageTitle: '', EmailsFoundRaw: '', NewUniqueEmailsAdded: '',
                UserAgentUsed: userAgentUsed, ProxyUsed: proxyUsed, WorkerID: 'N/A',
                 // Add original data if configured
                 ...(cfg.includeOriginalDataInReport && taskData.originalRow
                     ? Object.entries(taskData.originalRow).reduce((acc, [key, value]) => {
                           const reportKey = `Original_${key}`;
                           // Add original data column if the header exists in the calculated reportHeaders
                           // This ensures we only add columns that the writer expects
                           if (reportHeaders.some(h => h.id === reportKey)) {
                               acc[reportKey] = value;
                           }
                           return acc;
                       }, {})
                     : {})
            };

            try {
                // 1. Acquire Semaphore & Assign Worker/Context
                [, release] = await taskSemaphore.acquire();
                let foundWorker = false;
                while(!foundWorker) {
                    if (availableWorkerIndices.length === 0) { console.warn("[WORKER_WAIT] No worker available, waiting..."); await sleep(250); continue; }
                    workerId = availableWorkerIndices.shift();
                    workerCtx = browserContexts[workerId];
                    if (workerCtx === null || !workerCtx.newPage) { console.warn(`[WORKER_RETRY] Worker ${workerId} context is closed/invalid. Trying next.`); workerId = -1; workerCtx = null; continue; }
                    foundWorker = true;
                }
                if (workerId === -1 || !workerCtx) {
                    // This case should ideally not be reached with the loop, but safety first
                    throw new Error("Failed to acquire valid worker context after checks.");
                }

                reportData.WorkerID = workerId; // Update report data
                try { // Get context info for reporting
                    // Accessing _options is internal, might break in future Playwright versions.
                    // A safer way would be to track options alongside contexts externally.
                    userAgentUsed = workerCtx?._options?.userAgent || 'N/A';
                    proxyUsed = workerCtx?._options?.proxy?.server || '';
                    reportData.UserAgentUsed = userAgentUsed;
                    reportData.ProxyUsed = proxyUsed;
                } catch (optErr) { console.warn(`[WARN] Could not retrieve context options for WKR-${workerId}`); }

                activeTasks++;
                if (contextUsage[workerId]) { contextUsage[workerId].tasks++; }
                else { console.error(`[INTERNAL_ERROR] Missing contextUsage entry for workerId ${workerId}`); }


                // 2. Acquire Progress Bar Slot
                if (multiBar) {
                    barIndex = nextBarIndex++ % cfg.concurrency; bar = taskBars[barIndex];
                    if (bar.getTotal() === 0) bar.start(totalTasks, completedTasks);
                    bar.update(completedTasks, { status: 'Starting...', url: shortUrl, workerId: workerId, success: successCount, fail: failCount, skipped: skippedCount });
                }

                // 3. Robots Check (Primary Check)
                 const isAllowed = await isAllowedByRobots(url, cfg.userAgentIdentifier);
                 if (!isAllowed) {
                     reportData.Status = 'Skipped'; reportData.StatusDetail = 'robots.txt';
                     throw new SkipTaskError('Skipped by robots.txt'); // Use specific error
                 }

                 // 4. Visited Check (Primary Check)
                 if (visitedUrls.has(url)) {
                      reportData.Status = 'Skipped'; reportData.StatusDetail = 'Already Visited';
                      throw new SkipTaskError('Skipped (Already Visited)'); // Use specific error
                 }

                // 5. Execute Scraping Task (scrapeEmails handles its own internal skips/errors)
                const scrapeResult = await scrapeEmails(workerCtx, url, 0, bar, workerId);

                // 6. Process SUCCESS Result from scrapeEmails
                successCount++;
                const emailsToProcess = scrapeResult.finalEmailsAfterMX || [];
                const newEmailsFoundThisTask = [];
                // Check against global set *before* adding, track additions for report
                emailsToProcess.forEach(email => {
                     if (!existingEmails.has(email)) {
                          newEmailsFoundThisTask.push(email);
                          existingEmails.add(email); // Add to global set tracking *all* unique emails found
                     }
                });

                reportData.Status = 'Success';
                reportData.PageTitle = scrapeResult.pageTitle || '';
                reportData.EmailsFoundRaw = (scrapeResult.emailsFoundRaw || []).join(cfg.emailSeparator);
                reportData.NewUniqueEmailsAdded = newEmailsFoundThisTask.join(cfg.emailSeparator);
                // Refine status detail based on findings
                if (newEmailsFoundThisTask.length > 0) { reportData.StatusDetail = `Success (${newEmailsFoundThisTask.length} new email(s) found)`; }
                else if (emailsToProcess.length > 0) { reportData.StatusDetail = 'Success (Duplicate email(s) found)'; }
                else { reportData.StatusDetail = 'Success (No emails found)'; }

                if (bar) bar.update(completedTasks + 1, { status: `✅ Done (${newEmailsFoundThisTask.length} new)`, url: shortUrl, workerId: workerId, success: successCount, fail: failCount, skipped: skippedCount });
                else if (!cfg.useProgressBar) console.log(`[${completedTasks + 1}/${totalTasks}] Success: ${url} (${reportData.StatusDetail})`);

            } catch (error) {
                // Handle errors from scrapeEmails OR the SkipTaskErrors thrown above
                const conciseError = (error.message || 'Unknown scraping error').split('\n')[0];

                if (error instanceof SkipTaskError) {
                    // Status and StatusDetail should already be set in reportData before throwing
                    skippedCount++;
                    if (bar) bar.update(completedTasks + 1, { status: `🚫 Skip`, url: shortUrl, workerId: workerId, success: successCount, fail: failCount, skipped: skippedCount });
                    else if (!cfg.useProgressBar) console.log(`[${completedTasks + 1}/${totalTasks}] ${reportData.Status}: ${url} (${reportData.StatusDetail})`);
                    // Log skip to error log for traceability? Optional.
                     if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [TASK_SKIP] URL: ${url} Worker: ${workerId} Reason: ${reportData.StatusDetail}\n`);

                } else {
                     // Handle actual failures (scrape fail, block, proxy, nav fail etc.)
                     failCount++; // Count as failure
                     reportData.Status = 'Error'; // Default error status
                     reportData.StatusDetail = conciseError; // Default detail

                     // Refine status based on specific error types
                     if (error instanceof BlockDetectedError) {
                         reportData.Status = 'Blocked';
                         try { temporaryBlocklist.add(new URL(url).hostname); } catch {} // Add domain to temporary blocklist
                     } else if (error instanceof ProxyError) {
                          reportData.Status = 'Proxy Error';
                     } else if (conciseError.startsWith('[NAV_FAIL')) {
                          reportData.Status = 'Navigation Error';
                     } else if (conciseError.startsWith('[SCRAPE_FAIL')) {
                          reportData.Status = 'Scrape Error';
                     } // Add more specific statuses if needed

                     // Update progress bar/console
                     if (bar) bar.update(completedTasks + 1, { status: `❌ ${reportData.Status}`, url: shortUrl, workerId: workerId, success: successCount, fail: failCount, skipped: skippedCount });
                     else if (!cfg.useProgressBar) console.error(`[${completedTasks + 1}/${totalTasks}] ${reportData.Status}: ${url}: ${conciseError}`);

                     // Log to error file
                     if (errorLogStream) {
                        errorLogStream.write(`[${new Date().toISOString()}] [TASK_ERROR] URL: ${url} Worker: ${workerId} Status: ${reportData.Status} Error: ${conciseError}\n`);
                        // Avoid logging stack for simple navigation errors if too verbose
                        if (error.stack && reportData.Status !== 'Navigation Error') {
                            errorLogStream.write(`[Stack] ${error.stack}\n`);
                        }
                     }
                     // Update recent errors list
                     recentErrors.unshift(`[WKR-${workerId} | ${shortUrl} | ${reportData.Status}] ${conciseError}`);
                     if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.pop();
                }
            } finally {
                 activeTasks--;
                 completedTasks++;
                 reportData.Timestamp = new Date().toISOString(); // Set final timestamp

                 // Write the detailed report row, passing the headers
                 await writeReportRow(cfg, reportData, reportHeaders);

                 // --- Phase 3: Context Restart Logic ---
                 let contextReplaced = false;
                 if (workerId !== -1 && workerCtx && browserContexts[workerId] /* Check context wasn't nulled */ && contextUsage[workerId]) {
                    const usage = contextUsage[workerId];
                    const timeUsedMinutes = (Date.now() - usage.startTime) / (1000 * 60);
                    const restartTaskLimit = cfg.contextMaxTasks > 0 && usage.tasks >= cfg.contextMaxTasks;
                    const restartTimeLimit = cfg.contextMaxTimeMinutes > 0 && timeUsedMinutes >= cfg.contextMaxTimeMinutes;

                    if (restartTaskLimit || restartTimeLimit) {
                         console.log(`\n[CONTEXT_RESTART] WKR-${workerId} restarting. Reason: ${restartTaskLimit ? 'Task limit' : 'Time limit'}. Tasks: ${usage.tasks}, Mins: ${timeUsedMinutes.toFixed(1)}`);
                         if (bar) bar.update({ status: `RESTART WKR-${workerId}`, url: '', workerId: workerId, success: successCount, fail: failCount, skipped: skippedCount});
                         try { await workerCtx.close(); } catch (closeErr) { console.warn(`[CONTEXT_RESTART_WARN] Error closing old context ${workerId}: ${closeErr.message}`); }

                         try { // Attempt to create new context
                             let proxyServer = undefined; if (cfg.useProxies && cfg.proxies.length > 0) proxyServer = { server: cfg.proxies[workerId % cfg.proxies.length] };
                             const contextOptions = { javaScriptEnabled: true, ignoreHTTPSErrors: true, userAgent: (cfg.useUserAgents && cfg.userAgents.length > 0) ? cfg.userAgents[workerId % cfg.userAgents.length] : undefined, proxy: proxyServer };
                             const newContext = await browser.newContext(contextOptions);
                             newContext.on('close', () => { console.warn(`[CONTEXT_CLOSE_WARN] Restarted Context ${workerId} closed unexpectedly.`); if(browserContexts[workerId]) browserContexts[workerId] = null; });
                             browserContexts[workerId] = newContext; // Replace in pool
                             contextUsage[workerId] = { tasks: 0, startTime: Date.now() }; // Reset usage
                             contextReplaced = true;
                             console.log(`[CONTEXT_RESTART] WKR-${workerId} restarted successfully.`);
                         } catch (newCtxErr) {
                              console.error(`\n[CONTEXT_RESTART_FAIL] Failed to create new context for WKR-${workerId}: ${newCtxErr.message}`);
                              if (errorLogStream) errorLogStream.write(`[${new Date().toISOString()}] [CONTEXT_RESTART_FAIL] Worker: ${workerId} Error: ${newCtxErr.stack}\n`);
                              browserContexts[workerId] = null; // Mark context as unusable
                         }
                    }
                 }
                 // --- End Phase 3 Context Restart ---

                 // Release worker ID back to pool if context is still valid or was successfully replaced
                 if (workerId !== -1) { // Check if workerId was assigned
                     if (browserContexts[workerId] !== null) { // Context is valid (original or replaced)
                         availableWorkerIndices.push(workerId);
                     } else { // Context creation failed after restart attempt
                          console.warn(`[WORKER_REMOVED] Worker ${workerId} removed from pool due to restart failure or unexpected close.`);
                     }
                 }

                 // Release semaphore
                 if (release) try { release(); } catch (releaseError) { console.error(`\n[SEM_RELEASE_ERROR] ${releaseError.message}`); }
            }
        })(); // End async IIFE
    }); // End map

    console.log(`Waiting for ${totalTasks} tasks to complete...`);
    await Promise.all(processingPromises);

    // Final progress bar update / clear text progress
    if (multiBar) {
        taskBars.forEach(b => b.update(totalTasks, { status: 'Finished', url: '', workerId: 'N/A', success: successCount, fail: failCount, skipped: skippedCount }));
        multiBar.stop();
        console.log("\nProgress bar stopped.");
    } else if (completedTasks > 0) {
         process.stdout.write('\r' + ' '.repeat(process.stdout.columns - 1) + '\r'); // Clear line
         const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
         console.log(`Finished: ${completedTasks}/${totalTasks} | OK:${successCount} Err:${failCount} Skip:${skippedCount} | ${elapsed}s`);
    }
    console.log(`All ${totalTasks} processing attempts have finished.`);

    if (recentErrors.length > 0) {
        console.warn(`\n--- Recent Errors (${recentErrors.length} / ${failCount} Failed) ---`);
        recentErrors.forEach(err => console.warn(err));
        console.warn(`(See errors.log for full details)`);
        console.warn(`---------------------------\n`);
    }

    return { successCount, failCount, skippedCount };
}

/**
 * Summarizes results.
 */
async function summarizeResults(resultCounts) {
    console.log("\n--- Final Summary ---");
    const totalProcessed = resultCounts.successCount + resultCounts.failCount + resultCounts.skippedCount;
    const inputBaseName = path.basename(config.inputFile, path.extname(config.inputFile));
    const reportFileName = `${inputBaseName}${config.reportFileSuffix}`;
    const reportFilePath = path.resolve(path.dirname(path.resolve(__dirname, config.inputFile)), reportFileName); // Ensure report path is absolute

    console.log(`  Tasks Processed (Report Rows Written): ${totalProcessed}`);
    console.log(`    Succeeded: ${resultCounts.successCount}`);
    console.log(`    Failed (Errors/Blocked/Proxy): ${resultCounts.failCount}`);
    console.log(`    Skipped (Robots/Visited): ${resultCounts.skippedCount}`);
    console.log(`  Total Unique New Emails Added This Run: ${existingEmails.size}`);
    console.log(`  Detailed results written to: ${reportFilePath}`);
}

/**
 * Cleans up resources.
 */
async function cleanup(browser, browserContexts, localErrorLogStream, localMultiBar) {
    if (localMultiBar && !localMultiBar.stop) {
         try { localMultiBar.stop(); console.log("\nProgress bar stopped during cleanup."); } catch {}
    }

    saveState(); // Attempt to save state before closing things

    // Close Report Writer Stream (Best effort - csv-writer manages stream)
    if (reportCsvWriter) {
        console.log("Closing report CSV writer stream (flagging for GC)...");
        // csv-writer doesn't have an explicit public close/end method.
        // Process exit *should* flush buffers, but data loss is possible on unclean exits.
        reportCsvWriter = null; // Help GC
    }

    // Close Error Log Stream
    if (localErrorLogStream) {
        console.log("Closing error log stream...");
        // Ensure it finishes writing before moving on
        await new Promise(resolve => {
            localErrorLogStream.end(() => {
                console.log("Error log stream closed.");
                resolve();
            });
        }).catch(e => console.error("Error ending error log stream:", e));
        errorLogStream = null; // Prevent further writes globally
    } else {
        console.log("Error log stream was not initialized or already closed.");
    }

    // Close Browser Contexts
    if (browserContexts && browserContexts.length > 0) {
        console.log(`Closing ${browserContexts.filter(Boolean).length} active browser contexts...`);
        const closePromises = browserContexts
            .filter(ctx => ctx) // Filter out any contexts that were already nulled (e.g., due to crash)
            .map((ctx, index) => ctx.close().catch(e => console.error(`Error closing context ${index}: ${e.message}`)));
        try {
             await Promise.all(closePromises);
             console.log("Browser contexts closed.");
        }
        catch (closeAllError) { console.error("Error during batch context closing:", closeAllError); }
        browserContexts = []; // Clear array
    }

    // Report Final Memory Usage
    try { const used = process.memoryUsage(); console.log(`Final Memory Usage: RSS=${formatBytes(used.rss)}, HeapTotal=${formatBytes(used.heapTotal)}, HeapUsed=${formatBytes(used.heapUsed)}`); } catch {}

    // Close Browser
    if (browser && browser.isConnected()) { // Check if browser is still connected before closing
        console.log("Closing browser...");
        try { await browser.close(); console.log("Browser closed."); }
        catch (closeError) { console.error(`Error closing browser: ${closeError.message}`); }
    } else if (browser) {
        console.log("Browser was already disconnected.");
    } else {
        console.log("Browser was not initialized.");
    }
}


// --- Main Execution Flow ---
async function run() {
    let browser = null;
    let browserContexts = [];
    let localErrorLogStream = null;
    let localMultiBar = null;
    const startTime = Date.now();
    let reportHeaders = []; // To hold the generated report headers

    try {
        // 1. Parse CLI Args & Merge Config
        const argv = yargs(hideBin(process.argv))
            // Add all config options here... (Keep concise for brevity)
            .option('inputFile', { type: 'string', alias: 'i' })
            .option('concurrency', { type: 'number', alias: 'c' })
            .option('maxDepth', { type: 'number', alias: 'd' })
            .option('websiteColumnName', { type: 'string' })
            .option('headless', { type: 'boolean' })
            .option('browserType', { type: 'string', choices: ['chromium', 'firefox', 'webkit'] })
            .option('pageLoadTimeout', { type: 'number' })
            .option('navigationRetries', { type: 'number' })
             // ... other options from defaultConfig ...
             // Reporting Options
            .option('reportFileSuffix', { type: 'string' })
            .option('appendToReportFile', { type: 'boolean' })
            .option('includeOriginalDataInReport', { type: 'boolean' })
            .option('emailSeparator', { type: 'string' })
            .option('stateFile', { type: 'string' })
            .option('useProgressBar', { type: 'boolean' })
            .help().alias('h', 'help').strict().argv;

        const cliOverrides = Object.entries(argv)
            .filter(([key, value]) => value !== undefined && key !== '_' && key !== '$0')
            .reduce((obj, [key, value]) => { obj[key] = value; return obj; }, {});
        config = { ...defaultConfig, ...cliOverrides };

        // 2. Validate Config
        console.log("--- Validating Configuration ---");
        validateConfig(config);
        console.log("Configuration valid.");
        console.warn("Recommendation: Start with lower concurrency (e.g., -c 4 or -c 8) unless on a powerful machine.");

        // 3. Load External Lists
        console.log("--- Loading External Lists ---");
        const scriptDir = __dirname;
        // Combine default lists with file lists, ensuring uniqueness
        const loadAndMerge = (defaultList, fileKey) => [...new Set(defaultList.concat(loadListFromFile(config[fileKey], scriptDir)))];
        config.userAgents = loadAndMerge(defaultConfig.userAgents, 'userAgentsFile');
        config.proxies = loadAndMerge(defaultConfig.proxies, 'proxiesFile');
        config.emailFilter = loadAndMerge(defaultConfig.emailFilter, 'emailFilterFile');
        config.excludedDomains = loadAndMerge(defaultConfig.excludedDomains, 'excludedDomainsFile');
        config.excludedExtensions = loadAndMerge(defaultConfig.excludedExtensions, 'excludedExtensionsFile');
        config.excludedPatterns = loadAndMerge(defaultConfig.excludedPatterns, 'excludedPatternsFile');
        config.blockUrlPatterns = loadAndMerge(defaultConfig.blockUrlPatterns, 'blocklistPatternsFile');
        console.log("Finished loading external lists.");

        // 4. Log Final Config
        console.log(`--- Effective Configuration ---`);
        const loggableConfig = { ...config };
        ['userAgents', 'proxies', 'emailFilter', 'blockUrlPatterns', 'excludedDomains', 'excludedExtensions', 'excludedPatterns'].forEach(key => {
             if(loggableConfig[key]) loggableConfig[key] = `Loaded (${loggableConfig[key].length} items)`;
        });
        console.log(JSON.stringify(loggableConfig, null, 2));
        console.log(`-----------------------------`);

        // 5. Initialize (Browser, Contexts, State, Error Log)
        const initResult = await initialize(config);
        browser = initResult.browser;
        browserContexts = initResult.browserContexts;
        localErrorLogStream = initResult.errorLogStream;

        // 6. Read & Prepare Tasks (checks against loaded state)
        const { rowDataForPromises, originalHeaders } = await readAndPrepareTasks(config);

        // 7. Initialize Report Writer (if tasks exist or appending)
        // This function now returns the headers array
        if (rowDataForPromises.length > 0 || (config.appendToReportFile && fs.existsSync(path.join(path.dirname(path.resolve(__dirname, config.inputFile)), `${path.basename(config.inputFile, path.extname(config.inputFile))}${config.reportFileSuffix}`)))) {
            reportHeaders = initializeReportWriter(config, originalHeaders);
        } else {
            console.log("Skipping report writer initialization as there are no tasks to run and not appending.");
        }

        // 8. Run Scraping Tasks (pass the generated reportHeaders)
        const resultCounts = await runScrapingTasks(config, browser, browserContexts, localErrorLogStream, rowDataForPromises, reportHeaders);
        localMultiBar = multiBar; // Store for cleanup

        // 9. Summarize Results
        await summarizeResults(resultCounts);

    } catch (error) {
        console.error('\n--- A critical error occurred during execution ---');
        console.error(error.stack || error.message);
        if (localErrorLogStream) try { localErrorLogStream.write(`[FATAL_RUN] ${new Date().toISOString()} ${error.stack || error.message}\n`); } catch {}
        process.exitCode = 1; // Ensure non-zero exit code on error
    } finally {
        // 10. Cleanup (State saving, streams, browser)
        console.log("--- Starting Cleanup ---");
        await cleanup(browser, browserContexts, localErrorLogStream, localMultiBar);
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`--- Script finished in ${duration} seconds ---`);
    }
}


// --- Config Validation Function ---
function validateConfig(cfg) {
     const errors = [];
     const checkNumeric = (key, min = 0, isInt = false) => { const val = cfg[key]; if (typeof val !== 'number' || val < min || (isInt && !Number.isInteger(val))) errors.push(`'${key}' must be a ${isInt ? 'integer' : 'number'} >= ${min}. Value: ${val}`); };
     const checkBoolean = (key) => { if (typeof cfg[key] !== 'boolean') errors.push(`'${key}' must be boolean. Value: ${cfg[key]}`); };
     const checkString = (key, allowEmpty = false) => { if (typeof cfg[key] !== 'string' || (!allowEmpty && !cfg[key])) errors.push(`'${key}' must be non-empty string. Value: ${cfg[key]}`); };
     const checkArray = (key) => { if (!Array.isArray(cfg[key])) errors.push(`'${key}' must be an array. Value: ${JSON.stringify(cfg[key])}`); };
     const checkPathExists = (key) => { if (typeof cfg[key] === 'string' && cfg[key] && !fs.existsSync(path.resolve(__dirname, cfg[key]))) errors.push(`File specified in '${key}' not found: ${cfg[key]}`); };

     checkString('inputFile'); checkPathExists('inputFile');
     checkNumeric('pageLoadTimeout', 1000); checkNumeric('maxDepth', 0, true);
     checkNumeric('concurrency', 1, true); checkString('websiteColumnName');
     checkNumeric('navigationRetries', 0, true); checkNumeric('retryDelay', 100);
     checkNumeric('elementActionRetries', 0, true); checkNumeric('elementActionRetryDelay', 100);
     checkBoolean('useRateLimiting'); checkBoolean('useUserAgents'); checkBoolean('useProxies');
     checkString('proxyTestUrl'); checkNumeric('proxyTestTimeout', 500);
     checkString('browserType'); checkBoolean('headless'); checkString('pageWaitUntil');
     checkArray('blockResourceTypes'); checkArray('blockUrlPatterns');
     checkNumeric('postLoadDelay', 0); checkNumeric('waitForSelectorTimeout', 100);
     checkString('extractionMethod'); checkArray('emailLocationSelectors');
     checkNumeric('minDelayPerDomain', 0); checkNumeric('contextMaxTasks', 0, true);
     checkNumeric('contextMaxTimeMinutes', 0);
     checkString('outputFormat'); checkString('reportFileSuffix'); // New report
     checkBoolean('appendToReportFile'); checkBoolean('includeOriginalDataInReport'); checkString('emailSeparator'); // New report
     checkString('stateFile'); checkBoolean('useProgressBar');
     checkBoolean('respectRobotsTxt'); checkString('userAgentIdentifier');
     checkBoolean('detectBlocks'); checkArray('blockKeywords'); checkArray('blockSelectors');
     checkBoolean('scanShadowDOM'); checkBoolean('scanIFrames'); checkBoolean('validateDomainMX');
     checkNumeric('maxIframeScanDepth', 0, true);

     if (errors.length > 0) throw new Error(`Configuration errors found:\n- ${errors.join('\n- ')}`);
     if (cfg.useProxies && config.proxies.length === 0) console.warn("[CONFIG_WARN] `useProxies` is true, but proxy list is empty (check proxies.txt or list).");
     if (cfg.useUserAgents && config.userAgents.length === 0) console.warn("[CONFIG_WARN] `useUserAgents` is true, but user agent list is empty (check user_agents.txt or list).");
     if (cfg.validateDomainMX) console.warn("[CONFIG_WARN] `validateDomainMX` is true. This will significantly slow down scraping.");
}


// --- Execute ---
run().catch(error => {
    // This catch block handles errors thrown explicitly from `run` or unhandled promise rejections within it.
    console.error('\n--- UNHANDLED TOP-LEVEL ERROR (run function) ---');
    console.error(error.stack || error.message);
    // Try to log to file if stream was initialized
    if (errorLogStream && !errorLogStream.destroyed) {
        try {
            errorLogStream.write(`[FATAL_UNHANDLED_RUN] ${new Date().toISOString()} ${error.stack || error.message}\n`);
            errorLogStream.end(); // Try to close the stream
        } catch(e) { console.error("Error writing final error to log:", e); }
    }
    // Ensure progress bar is stopped
    if (multiBar && !multiBar.stop) try { multiBar.stop(); } catch {}
    process.exitCode = 1; // Set exit code
    // Force exit after a short delay if cleanup doesn't happen
    setTimeout(() => { console.error("Forcing exit after unhandled error."); process.exit(1); }, 2000);
});

// --- SIGINT Handler (Ctrl+C) ---
process.on('SIGINT', async () => {
  console.log("\nSIGINT received. Attempting graceful shutdown...");
  // Stop progress bar immediately
  if (multiBar && !multiBar.stop) try { multiBar.stop(); } catch {}

  console.log("Saving state...");
  saveState(); // Attempt to save state

  // Close error log stream gracefully
  if (errorLogStream && !errorLogStream.destroyed) {
      console.log("Closing error log stream due to SIGINT...");
      try {
          errorLogStream.write(`[${new Date().toISOString()}] [INFO] SIGINT received. Shutting down.\n`);
          // Wait for the stream to finish writing and close
          await new Promise(resolve => errorLogStream.end(resolve));
          console.log("Error log stream closed.");
      } catch (e) { console.error("Error closing error log stream:", e); }
      errorLogStream = null;
  }

   // csv-writer buffers might not flush fully on SIGINT. Data loss is possible.
   console.warn("Report file writing might be incomplete due to SIGINT.");

   // Note: Active scraping tasks might be abruptly terminated by browser/context close in `finally`.
   // The main `run` function's `finally` block should still execute for cleanup.
  console.log("Cleanup should proceed via the main 'finally' block... Setting exit code 130.");
  process.exitCode = 130; // Standard exit code for SIGINT

  // Force exit after a timeout if the cleanup doesn't complete quickly.
  // This prevents hanging indefinitely if cleanup code has issues.
  setTimeout(() => {
      console.warn("Shutdown timeout exceeded after SIGINT. Forcing exit.");
      process.exit(130);
  }, 10000); // Give 10 seconds for cleanup in the main finally block
});