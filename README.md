# Advanced Email Scraper (Playwright)

[![Node.js CI](https://github.com/SieteCuatro/ScrapeEmailfromWeb/actions/workflows/node.js.yml/badge.svg)](https://github.com/SieteCuatro/ScrapeEmailfromWeb/actions/workflows/node.js.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/SieteCuatro/ScrapeEmailfromWeb/blob/main/LICENSE)

A robust and configurable Node.js script for scraping email addresses from a list of websites provided in a CSV file. It leverages Playwright for accurate browser automation and includes features for concurrency, retries, filtering, state management, block detection, and detailed reporting.

## ✨ Features

*   **CSV Input:** Reads target websites from a specified column in a CSV file.
*   **Concurrent Scraping:** Processes multiple websites simultaneously using Playwright browser contexts for speed.
*   **Configurable Depth:** Can crawl linked pages up to a specified depth (`maxDepth`).
*   **Robust Error Handling:** Implements retries for navigation and actions, logs errors, and handles common issues gracefully.
*   **Detailed Reporting:** Generates a comprehensive CSV report (`_report.csv`) with status, emails found, timestamps, metadata, and optional original data.
*   **State Management:** Saves visited URLs (`scraper_state.json`) to prevent re-scraping and allow resuming interrupted runs.
*   **Extensive Filtering:**
    *   Filters emails based on common patterns and custom blocklists (`email_filter.txt`).
    *   Excludes specific domains (`excluded_domains.txt`).
    *   Skips URLs based on file extensions (`excluded_extensions.txt`) or URL path patterns (`excluded_patterns.txt`).
*   **Performance Optimization:**
    *   Blocks unnecessary resources (images, CSS, fonts, tracking scripts) via `blockResourceTypes` and `blockUrlPatterns`.
    *   Configurable timeouts and wait conditions.
    *   Context Recycling: Automatically restarts browser contexts after a certain number of tasks or time to mitigate memory leaks.
*   **Anti-Blocking Features:**
    *   User-Agent Rotation (`useUserAgents`, `user_agents.txt`).
    *   Proxy Support (`useProxies`, `proxies.txt`).
    *   Optional `robots.txt` respect (`respectRobotsTxt`).
    *   Basic block detection (Cloudflare, CAPTCHA challenges) (`detectBlocks`).
    *   Optional per-domain request delay (`minDelayPerDomain`).
*   **Advanced Extraction:**
    *   Optional scanning of Shadow DOM (`scanShadowDOM`).
    *   Optional scanning of iFrames (`scanIFrames`).
    *   Optional email domain MX record validation (`validateDomainMX` - significantly increases time).
*   **User-Friendly:**
    *   Dependency check on startup.
    *   Command-line interface (`yargs`) for easy configuration overrides.
    *   Progress bar (`cli-progress`) for visual feedback.
    *   Graceful shutdown on `Ctrl+C` (SIGINT).

## 📋 Prerequisites

*   **Node.js:** Version 18.x or higher recommended (uses native `fetch`).
*   **npm** (or yarn)

## 🚀 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/SieteCuatro/ScrapeEmailfromWeb.git
    cd ScrapeEmailfromWeb
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Install Playwright browsers:** This is a crucial step!
    ```bash
    npx playwright install
    # Or install only a specific browser: npx playwright install chromium
    ```

4.  **Prepare Input File:**
    *   Create a CSV file (e.g., `input.csv`) in the project directory.
    *   Ensure it has a column containing the websites to scrape. By default, the script looks for a column named `Website`. You can change this with the `--websiteColumnName` option or in the configuration.
    *   Example `input.csv`:
        ```csv
        CompanyName,Website,OtherData
        Example Corp,"http://example.com",Some info
        Test Site,"https://test-site.org",More data
        No Protocol,"domain.net",Data
        ```

5.  **(Optional) Prepare Filter/List Files:**
    *   Create any necessary `.txt` files (e.g., `proxies.txt`, `user_agents.txt`, `email_filter.txt`) in the project directory if you want to override or extend the default lists.
    *   Format: One item per line. Lines starting with `#` are ignored as comments.
    *   Example `email_filter.txt`:
        ```txt
        # Ignore common placeholders
        @example.
        @domain.
        # Ignore specific domains
        spamdomain.com
        # Ignore specific addresses
        noreply@
        ```

## ⚡ Quick Start

1.  Make sure you have created your input CSV file (e.g., `input.csv`) with a `Website` column.
2.  Run the script with the input file specified:
    ```bash
    node scraper.js -i input.csv
    ```
3.  The script will start processing the URLs. You will see progress updates in the console (or a progress bar).
4.  Once finished, check the output files:
    *   `input_report.csv`: Contains detailed results for each URL processed.
    *   `scraper_state.json`: Stores visited URLs for future runs.
    *   `errors.log`: Logs any errors encountered during the run.

## ⚙️ Usage

```bash
node scraper.js [options]
```

**Common Options:**

*   `-i, --inputFile <file>`: Path to the input CSV file (default: `test.csv`). **(Required in most cases)**
*   `-c, --concurrency <number>`: Number of websites to process concurrently (default: system CPU core count - 1, min 4). **Start low (e.g., 4 or 8)!**
*   `-d, --maxDepth <number>`: Maximum depth to crawl links (0 = only scrape the initial URL, 1 = scrape initial URL and its direct links, etc.) (default: `0`).
*   `--websiteColumnName <name>`: Name of the column in the CSV containing website URLs (default: `Website`).
*   `--headless <boolean>`: Run browsers in headless mode (true/false) (default: `true`). Set to `false` to see the browsers operate.
*   `--browserType <type>`: Browser engine to use (`chromium`, `firefox`, `webkit`) (default: `chromium`).
*   `--reportFileSuffix <suffix>`: Suffix for the generated report file (default: `_report.csv`).
*   `--appendToReportFile <boolean>`: Append to the report file if it exists (default: `false`).
*   `--includeOriginalDataInReport <boolean>`: Include all columns from the input CSV in the report (default: `false`).
*   `--useProgressBar <boolean>`: Show a progress bar during scraping (default: `true`).
*   `-h, --help`: Show help information.

*For a full list of options and their defaults, see the Configuration section below or run `node scraper.js --help`.*

## 🔧 Configuration

The script uses a layered configuration approach:

1.  **Defaults:** Defined in the `defaultConfig` object within `scraper.js`.
2.  **External Files:** Lists like user agents, proxies, and filters are loaded from `.txt` files specified in the config (e.g., `userAgentsFile`, `proxiesFile`). These *extend* the default lists.
3.  **Command-Line Arguments:** Options provided via the CLI (e.g., `-c 8`) override defaults and file-loaded settings.

**Key Configuration Options (Defaults shown):**

*(See `defaultConfig` in `scraper.js` for the complete list)*

**Basic Settings:**

*   `inputFile: 'test.csv'`: Input CSV filename.
*   `pageLoadTimeout: 15000`: Max time (ms) to wait for page navigation.
*   `maxDepth: 0`: Max crawl depth (0 = initial URL only).
*   `concurrency: os.cpus().length > 2 ? os.cpus().length - 1 : 4`: Number of parallel browser contexts. **Adjust based on system resources!**
*   `websiteColumnName: 'Website'`: CSV column header for URLs.

**Retries:**

*   `navigationRetries: 2`: Number of times to retry page navigation on failure.
*   `retryDelay: 2000`: Base delay (ms) before retrying navigation (increases with attempts).
*   `elementActionRetries: 1`: Number of times to retry element actions (like getting content).
*   `elementActionRetryDelay: 500`: Delay (ms) before retrying element actions.

**Filtering (Defaults + External Files):**

*   `emailFilter: [...]` / `emailFilterFile: 'email_filter.txt'`: Strings/patterns to filter out found emails.
*   `excludedDomains: [...]` / `excludedDomainsFile: 'excluded_domains.txt'`: Domains to completely ignore during scraping and crawling.
*   `excludedExtensions: [...]` / `excludedExtensionsFile: 'excluded_extensions.txt'`: File extensions to ignore when crawling links.
*   `excludedPatterns: [...]` / `excludedPatternsFile: 'excluded_patterns.txt'`: URL path patterns to ignore when crawling links (e.g., `/cart/`, `/login`).

**Performance & Behavior:**

*   `useRateLimiting: false`: Enable global rate limiting (tokens/sec based on concurrency).
*   `useUserAgents: true` / `userAgentsFile: 'user_agents.txt'`: Rotate User-Agent strings.
*   `useProxies: false` / `proxiesFile: 'proxies.txt'`: Use proxies (format: `protocol://ip:port` or `protocol://user:pass@ip:port`). Proxies are assigned round-robin to workers.
*   `browserType: 'chromium'`: Playwright browser (`chromium`, `firefox`, `webkit`).
*   `headless: true`: Run browser without UI.
*   `pageWaitUntil: 'domcontentloaded'`: Playwright navigation wait state (`load`, `domcontentloaded`, `networkidle`, `commit`).
*   `blockResourceTypes: [...]`: Resource types to block (e.g., `image`, `stylesheet`, `font`).
*   `blockUrlPatterns: [...]` / `blocklistPatternsFile: 'blocklist_patterns.txt'`: URL patterns to block (e.g., analytics, ads, tracking pixels).
*   `postLoadDelay: 500`: Additional delay (ms) after page load before extraction.
*   `waitForSelector: null`: CSS selector to wait for before extraction.
*   `waitForSelectorTimeout: 5000`: Max time (ms) to wait for `waitForSelector`.
*   `extractionMethod: 'innerText'`: How to get page content ('innerText', 'content' (HTML), 'both').
*   `emailLocationSelectors: []`: Specific CSS selectors to extract text from for email searching (if non-empty, overrides `extractionMethod`).
*   `minDelayPerDomain: 500`: Minimum delay (ms) between requests *to the same domain* across all workers.
*   `contextMaxTasks: 200`: Max number of tasks a browser context handles before restarting.
*   `contextMaxTimeMinutes: 60`: Max time (minutes) a browser context runs before restarting.

**Output:**

*   `outputFormat: 'csv'`: Primarily affects report delimiter (',' for csv).
*   `reportFileSuffix: '_report.csv'`: Suffix for the detailed report file.
*   `appendToReportFile: false`: Append to report file if it exists.
*   `includeOriginalDataInReport: false`: Add original CSV columns to the report.
*   `emailSeparator: '; '`: Separator used for multiple emails in report cells.

**State:**

*   `stateFile: 'scraper_state.json'`: File to save/load visited URLs.

**Progress Reporting:**

*   `useProgressBar: true`: Display the `cli-progress` bar.

**Robots & Block Detection:**

*   `respectRobotsTxt: true`: Check `robots.txt` before scraping/crawling.
*   `userAgentIdentifier: 'EmailScraperBot/1.1 (+http://example.com/bot-info)'`: User-Agent used for `robots.txt` checks.
*   `detectBlocks: true`: Enable detection of Cloudflare/CAPTCHA pages.
*   `blockKeywords: [...]`: Keywords in page title/content indicating a block.
*   `blockSelectors: [...]`: CSS selectors indicating a block page.

**Advanced Extraction:**

*   `scanShadowDOM: false`: Attempt to extract text from Shadow DOM elements.
*   `scanIFrames: false`: Attempt to extract text from iFrames.
*   `validateDomainMX: false`: Check DNS MX records for email domains (slows down scraping significantly).
*   `maxIframeScanDepth: 1`: Recursion depth for scanning nested iFrames.

**External List File Format (`.txt`):**

*   One item per line.
*   Blank lines are ignored.
*   Lines starting with `#` are treated as comments and ignored.
*   Example `proxies.txt`:
    ```txt
    # SOCKS5 Proxy
    socks5://127.0.0.1:9050
    # HTTP Proxy with Auth
    http://user:password@proxy.example.com:8080
    # Simple HTTP Proxy
    http://192.168.1.100:3128
    ```

## 📄 Output Files

*   **`<input_filename>_report.csv`:** (e.g., `input_report.csv`)
    *   The main output file containing detailed results for each processed URL.
    *   **Columns:**
        *   `InputURL`: The original URL from the input CSV.
        *   `NormalizedURL`: The standardized URL used for scraping.
        *   `Status`: Outcome (e.g., `Success`, `Error`, `Skipped`, `Blocked`, `Navigation Error`, `Proxy Error`).
        *   `StatusDetail`: More info (error message, skip reason, email count).
        *   `Timestamp`: ISO timestamp of when processing finished for the URL.
        *   `PageTitle`: Title of the scraped page (if successful).
        *   `EmailsFoundRaw`: All potential emails found on the page (before MX validation), separated by `emailSeparator`.
        *   `NewUniqueEmailsAdded`: Emails found on this page that were not previously found in *this run*, separated by `emailSeparator`.
        *   `UserAgentUsed`: The User-Agent string used for this request.
        *   `ProxyUsed`: The proxy server used (if any).
        *   `WorkerID`: The internal worker ID that processed the URL.
        *   `Original_*`: Columns from the input CSV (if `includeOriginalDataInReport` is true).
*   **`scraper_state.json`:**
    *   Stores a list of normalized URLs that have already been visited (successfully scraped, skipped, or failed definitively).
    *   Used on subsequent runs to avoid re-processing the same pages. Automatically loaded if it exists.
*   **`errors.log`:**
    *   Logs detailed error messages, including timestamps, URLs, worker IDs, and stack traces (where applicable). Useful for debugging failed scrapes.

## 💡 Advanced Topics

*   **Proxies:** Ensure your proxies are working and match the format `protocol://[user:pass@]host:port`. The script assigns proxies round-robin to workers. If a proxy causes navigation errors, it might lead to task failures (`Proxy Error` status).
*   **User Agents:** Provide a good list of diverse, realistic user agents in `user_agents.txt` for better anti-blocking.
*   **Block Detection:** The `detectBlocks` feature uses keywords and selectors. It might not catch all blocking mechanisms. If blocked (`Blocked` status), the domain is temporarily added to an internal blocklist for the current run.
*   **MX Validation:** Enabling `validateDomainMX` significantly slows down the process due to DNS lookups for every unique email domain found. It helps filter out emails with invalid domains but adds considerable overhead.
*   **iFrame/Shadow DOM:** Scanning these can find hidden emails but increases page interaction time and complexity, potentially leading to more errors on complex sites.
*   **Concurrency:** High concurrency (`-c`) requires significant RAM and CPU. Start low (e.g., 4, 8) and increase gradually while monitoring system performance (`htop`, Task Manager). Too high concurrency can lead to browser crashes, timeouts, and instability.

## 🐛 Troubleshooting

*   **Dependency Errors on Start:** Run `npm install` again. Ensure all dependencies listed at the top of `scraper.js` are installed.
*   **Playwright Errors (`browserType.launch: Executable doesn't exist`):** Run `npx playwright install` to download the necessary browser binaries.
*   **High RAM/CPU Usage:** Lower the concurrency (`-c <lower_number>`). Increase context recycling frequency (`contextMaxTasks`, `contextMaxTimeMinutes`). Block more resources (`blockResourceTypes`, `blockUrlPatterns`).
*   **Many Timeouts (`Navigation Timeout Exceeded`):** Increase `pageLoadTimeout`. Check network connection. The target sites might be slow or blocking. Try lowering concurrency.
*   **Blocked Errors:** The target website is likely detecting the scraper. Try using proxies (`--useProxies`), rotating user agents (`--useUserAgents`), increasing delays (`--minDelayPerDomain`, `--postLoadDelay`), or running with `--headless false` to observe behavior. Check `robots.txt` manually.
*   **No Emails Found:** Verify the target websites actually contain emails in plain text or common `data-` attributes. Check if `emailFilter` is too aggressive. Try `extractionMethod: 'both'`.
*   **Report File Issues:** Ensure the script has write permissions in the output directory. Check for invalid characters in data if using `includeOriginalDataInReport`.

## 🙌 Contributing

Contributions, issues, and feature requests are welcome! Please feel free to open an issue or submit a pull request on the [GitHub repository](https://github.com/SieteCuatro/ScrapeEmailfromWeb).

## 📄 License

Copyright 2024 SieteCuatro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

For the full license text, see the [LICENSE](LICENSE) file.
```