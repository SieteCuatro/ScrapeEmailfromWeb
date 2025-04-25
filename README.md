# Node.js Playwright Email Scraper

A configurable and robust Node.js script using Playwright to scrape websites listed in a CSV file for email addresses. It features concurrency, retries, block detection, state management, detailed reporting, and various performance optimizations.

## Features

*   **CSV Input:** Reads target websites from a specified column in a CSV file.
*   **Concurrent Scraping:** Uses multiple browser contexts to process URLs concurrently (configurable).
*   **Playwright Powered:** Leverages Playwright for robust browser automation (supports Chromium, Firefox, WebKit).
*   **Deep Crawling:** Optionally crawls linked pages within the same domain up to a specified depth (`maxDepth`).
*   **Email Extraction:** Finds emails using regex (including `[at]`, `[dot]` variations) and checks `data-email` attributes.
*   **Filtering:** Excludes emails, domains, URL patterns, and file extensions based on configurable lists (loaded from files or defaults).
*   **Robustness:**
    *   **Retries:** Automatic retries for navigation failures and element actions.
    *   **Block Detection:** Attempts to identify and skip pages protected by Cloudflare, CAPTCHAs, etc. (Adds blocked domains to a temporary skip list).
    *   **`robots.txt`:** Respects `robots.txt` rules (configurable).
    *   **Per-Domain Delay:** Enforces a minimum delay between requests to the same domain.
    *   **Context Restart:** Automatically restarts browser contexts after a certain number of tasks or time to mitigate memory leaks or instability.
*   **Performance:**
    *   **Resource Blocking:** Blocks specified resource types (images, CSS, fonts) and URL patterns (analytics, ads) to speed up page loads.
    *   **Headless Mode:** Runs browsers headlessly by default (configurable).
*   **Configuration:**
    *   Highly configurable via command-line arguments and defaults within the script.
    *   Loads external lists for user agents, proxies, filters, etc., from `.txt` files.
*   **State Management:** Saves visited URLs to a `scraper_state.json` file, allowing the script to resume without reprocessing completed URLs.
*   **Reporting:**
    *   Generates a detailed CSV report (`<input_filename>_report.csv`) with status (Success, Error, Skipped, Blocked), timestamps, page titles, raw emails found, *new* unique emails added during the run, worker ID, user agent/proxy used, and optionally the original CSV data.
    *   Logs errors and warnings to `errors.log`.
*   **Advanced Options:**
    *   User-Agent Rotation.
    *   Proxy Support (rotates through a provided list).
    *   Optional DNS MX Record Validation for found email domains (slows down scraping significantly).
    *   Optional iFrame Content Scanning.
*   **User Experience:** Displays progress using a multi-bar console interface (`cli-progress`).

## Quickstart

Get up and running with the scraper quickly.

1.  **Check Node.js:** Ensure you have Node.js (v18 or higher recommended) and npm installed. You can check by running:
    ```bash
    node -v
    npm -v
    ```
    If not installed, download from [nodejs.org](https://nodejs.org/).

2.  **Download Script:** Obtain the `scraper.js` file and place it in a directory.

3.  **Navigate:** Open your terminal or command prompt and go to the script directory:
    ```bash
    cd /path/to/your/script/directory
    ```

4.  **Install Dependencies:** Install the required Node.js packages:
    ```bash
    npm install playwright csv-parser csv-writer async-mutex limiter cli-progress robots-parser yargs
    ```

5.  **Install Playwright Browsers:** Download the necessary browser binaries for Playwright:
    ```bash
    npx playwright install
    ```

6.  **Prepare Input:** Create a CSV file (e.g., `test.csv`) with a column named `Website` containing the URLs you want to scrape.

7.  **Run the Scraper:** Execute the script using Node.js:
    ```bash
    node scraper.js -i test.csv
    ```
    The results will be saved in a report file (e.g., `test_report.csv`).

=======
## Prerequisites

1.  **Clone or Download:** Get the script file (`scraper.js`) and any accompanying `.txt` list files (like `proxies.txt`, `user_agents.txt`, etc.) into a directory.
2.  **Navigate:** Open your terminal or command prompt and navigate into that directory:
    ```bash
    cd /path/to/your/script/directory
    ```
3.  **Install Dependencies:**
    ```bash
    npm install playwright csv-parser csv-writer async-mutex limiter cli-progress robots-parser yargs
    # Or using yarn:
    # yarn add playwright csv-parser csv-writer async-mutex limiter cli-progress robots-parser yargs
    ```
    *(Note: `limiter` is installed but the global rate limiting feature (`useRateLimiting`) might not be fully utilized in the current task loop logic; per-domain delay is the primary rate control.)*
4.  **Install Playwright Browsers:** This is crucial!
    ```bash
    npx playwright install
    # You can install specific browsers if needed:
    # npx playwright install chromium
    ```

## Configuration

The script can be configured in several ways:

1.  **Defaults:** Modify the `defaultConfig` object directly within the script file (`scraper.js`) for baseline settings.
2.  **Command-Line Arguments:** Override defaults using CLI flags (see `Usage` below). Use `--help` for a full list.
    *   Example: `-c 8` sets concurrency to 8. `--headless false` runs browsers visibly.
3.  **External `.txt` Files:** Place `.txt` files (e.g., `user_agents.txt`, `proxies.txt`, `email_filter.txt`, `excluded_domains.txt`, `excluded_extensions.txt`, `excluded_patterns.txt`, `blocklist_patterns.txt`) in the same directory as the script. The script will load these lists and merge them with the default lists defined in `defaultConfig`. Each line in the file is treated as an entry (lines starting with `#` are ignored).

**Key Configuration Options (via CLI or `defaultConfig`):**

*   `inputFile` (`-i`, `--inputFile`): Path to the input CSV file (Default: `test.csv`).
*   `websiteColumnName` (`--websiteColumnName`): Name of the column in the CSV containing website URLs (Default: `Website`).
*   `concurrency` (`-c`, `--concurrency`): Number of browser contexts to run in parallel (Default: System CPU core count - 1, min 4). **Start low (e.g., 4) and increase cautiously!**
*   `maxDepth` (`-d`, `--maxDepth`): How many levels deep to crawl links on the same domain (0 = only the initial URL, 1 = initial URL + links found on it, etc.) (Default: 0).
*   `headless` (`--headless`): Run browsers without a visible UI (Default: `true`). Set to `false` for debugging.
*   `browserType` (`--browserType`): Browser engine to use (`chromium`, `firefox`, `webkit`) (Default: `chromium`).
*   `pageLoadTimeout` (`--pageLoadTimeout`): Max time in milliseconds to wait for a page to load (Default: 15000).
*   `respectRobotsTxt` (`--respectRobotsTxt`): Whether to obey `robots.txt` rules (Default: `true`).
*   `validateDomainMX` (`--validateDomainMX`): Check if the domain of found emails has valid MX records (significantly increases runtime) (Default: `false`).
*   `reportFileSuffix` (`--reportFileSuffix`): Suffix for the output report file (Default: `_report.csv`).
*   `appendToReportFile` (`--appendToReportFile`): Append to the report file if it exists (Default: `false`).
*   `includeOriginalDataInReport` (`--includeOriginalDataInReport`): Add all columns from the original input CSV to the report (Default: `false`).
*   `stateFile` (`--stateFile`): Name of the file to store visited URLs (Default: `scraper_state.json`).
*   `useProgressBar` (`--useProgressBar`): Display the console progress bar (Default: `true`).

## Usage

Run the script from your terminal using Node.js:

```bash
node scraper.js [options]
```

**Examples:**

*   **Basic Run (using defaults):**
    ```bash
    # Assumes input file is test.csv
    node scraper.js
    ```
*   **Specify Input File:**
    ```bash
    node scraper.js -i my_websites.csv
    ```
*   **Set Concurrency and Crawl Depth:**
    ```bash
    node scraper.js -i leads.csv -c 8 -d 1
    ```
*   **Run Visibly (Non-Headless):**
    ```bash
    node scraper.js -i data.csv --headless false
    ```
*   **Get Help:**
    ```bash
    node scraper.js --help
    ```

*(If you make the script executable (`chmod +x scraper.js`), you can run it directly: `./scraper.js [options]`)*

## Input Format

*   The input file must be a CSV.
*   It must contain a header row.
*   It needs a column containing the websites to scrape. By default, the script looks for a column named `Website`. You can specify a different column name using the `--websiteColumnName` option.
*   URLs should ideally include the scheme (`http://` or `https://`). The script attempts to add `http://` if missing.

**Example `input.csv`:**

```csv
CompanyName,Website,ContactPerson
Example Corp,"http://example.com",Jane Doe
Test Inc,"https://test-site.org",John Smith
Another Biz,"www.another-biz.net",
```

## Output Files

The script generates the following files in the same directory as the input CSV:

1.  **`<input_filename>_report.csv`:**
    *   Contains detailed results for each URL processed (or skipped).
    *   Columns include: `InputURL`, `NormalizedURL`, `Status` (e.g., Success, Error, Skipped, Blocked), `StatusDetail` (error message or email count), `Timestamp`, `PageTitle`, `EmailsFoundRaw` (all emails found on the page, semi-colon separated), `NewUniqueEmailsAdded` (emails found by this task *not previously seen* in the entire run), `UserAgentUsed`, `ProxyUsed`, `WorkerID`, and optionally columns from the original CSV (`Original_ColumnName`).
2.  **`errors.log`:**
    *   Logs detailed errors, warnings, and context restarts encountered during runtime. Useful for debugging.
3.  **`scraper_state.json`:**
    *   Stores a list of successfully visited or intentionally skipped (e.g., by robots.txt) normalized URLs.
    *   On subsequent runs, the script loads this file to avoid re-scraping these URLs. Delete this file to start fresh.

## Important Notes & Considerations

*   **Concurrency & System Resources:** High concurrency requires significant CPU, RAM, and network bandwidth. Start with a low concurrency value (`-c 4` or `-c 8`) and monitor your system's performance before increasing it. Too high a value can lead to crashes or instability.
*   **Legality & Ethics:** Web scraping can be legally complex. **Always** respect `robots.txt` (`--respectRobotsTxt true` is the default). Check the target websites' **Terms of Service**. Do not overload websites with requests (use reasonable concurrency and `minDelayPerDomain`). Ensure compliance with data privacy regulations (like GDPR, CCPA) and anti-spam laws when using collected email addresses. Use this script responsibly.
*   **Block Detection:** The block detection mechanism is based on common keywords and selectors but is **not foolproof**. Websites constantly change their blocking strategies.
*   **Memory Usage:** Playwright can consume considerable memory. The context restarting feature helps, but monitor usage during long runs.
*   **MX Validation:** Enabling `--validateDomainMX` significantly slows down the process due to the DNS lookups involved for every unique email domain found.
*   **Error Handling:** While the script tries to handle many errors, unexpected website structures or network issues can still cause failures. Check `errors.log` for details.

## License

(Optional: Add your license here, e.g., MIT)

```
MIT License

Copyright (c) [Year] [Your Name/Organization]

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