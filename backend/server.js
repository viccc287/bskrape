import express from 'express';
import puppeteer from 'puppeteer-extra';
import blockResourcesPlugin from 'puppeteer-extra-plugin-block-resources';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import cors from 'cors';
import { performance as nodePerformance } from 'perf_hooks';
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from 'puppeteer';
import chalk from 'chalk';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
const log = console.log;
const app = express();
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV === 'development') {
    dotenv.config();
}
app.use(cors());
app.use(express.json());
const BASE_URL = 'https://despensa.bodegaaurrera.com.mx';
const LOAD_URL = 'https://despensa.bodegaaurrera.com.mx/ip/refresco-coca-cola-sabor-original-2-5-l/00750105530524';
const MAX_CONCURRENT_PAGES = 5;
const ZIP_CODE = '97138';
const USE_ZIP_CODE = true;
const abortControllers = new Map();
const sseClients = new Map();
let globalScrapedData = null;
const PROXY_URL = process.env.PROXY_URL;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!PUPPETEER_EXECUTABLE_PATH) {
    log(chalk.red('Puppeteer executable path not provided. Exiting...'));
    process.exit(1);
}
if (!PROXY_URL || !PROXY_USERNAME || !PROXY_PASSWORD) {
    log(chalk.red('Proxy credentials not provided. Exiting...'));
    process.exit(1);
}
let totalBytesTransferred = 0;
const logBoth = (message, requestId) => {
    console.log(message);
    const sseRes = sseClients.get(requestId);
    if (sseRes) {
        sseRes.write(`data: ${JSON.stringify({ message })}\n\n`);
    }
};
const generateCsvString = (items) => {
    const headers = [
        'id',
        'link',
        'imageSrc',
        'currentPrice',
        'originalPrice',
        'ending',
        'discount',
        'brand',
        'productName',
        'storeName',
        'storeAddress',
    ];
    const csvRows = [headers.join(',')];
    items.forEach((item) => {
        const row = headers.map((header) => `"${item[header] ?? ''}"`).join(',');
        csvRows.push(row);
    });
    return csvRows.join('\n');
};
const gotoWithTimeout = async (page, url, signal, timeout = 300000) => {
    const abortPromise = new Promise((_, reject) => {
        const abortHandler = () => {
            signal.removeEventListener('abort', abortHandler);
            reject(new Error('Navigation aborted because client disconnected'));
        };
        signal.removeEventListener('abort', abortHandler);
        signal.addEventListener('abort', abortHandler);
    });
    try {
        return await Promise.race([
            page.goto(url, { timeout, waitUntil: 'networkidle0' }),
            abortPromise,
        ]);
    }
    catch (error) {
        if (signal.aborted) {
            throw new Error('Navigation aborted because client disconnected');
        }
        throw error;
    }
};
puppeteer
    .use(blockResourcesPlugin({
    blockedTypes: new Set([
        'image',
        'font',
        'media',
        'texttrack',
        'eventsource',
        'websocket',
        'manifest',
        'xhr',
        'other',
    ]),
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
}))
    .use(StealthPlugin())
    .use(AdblockerPlugin({
    blockTrackers: true,
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
}));
const scrapeAllUrls = async (urls, signal, requestId, zipCode) => {
    if (signal.aborted) {
        throw new Error('Aborted before opening browser');
    }
    blockResourcesPlugin().blockedTypes.add('stylesheet');
    logBoth(chalk.blue('Opening browser...'), requestId);
    const browser = await puppeteer.launch({
        headless: true,
        args: [`--proxy-server=${PROXY_URL}`],
        executablePath: process.env.NODE_ENV === 'production'
            ? PUPPETEER_EXECUTABLE_PATH
            : puppeteer.executablePath(),
    });
    let resultsToReturn = [];
    let resultsToStore = [];
    const startTime = nodePerformance.now();
    try {
        await setZipCode(zipCode, browser, signal, requestId);
        const queue = [...urls];
        const activePromises = new Set();
        const processNext = async () => {
            while (queue.length > 0 && activePromises.size < MAX_CONCURRENT_PAGES) {
                if (signal.aborted) {
                    throw new Error('Aborted before processing next page');
                }
                const targetUrl = queue.shift();
                const scrapePromise = scrapeItems(browser, targetUrl, signal, requestId)
                    .then((resultObject) => {
                    resultsToReturn = [...resultsToReturn, ...resultObject.relevantResults];
                    resultsToStore = [...resultsToStore, ...resultObject.allResults];
                })
                    .catch((error) => {
                    logBoth(chalk.red(`Error scraping ${targetUrl}: `, error), requestId);
                })
                    .finally(() => {
                    activePromises.delete(scrapePromise);
                    processNext();
                });
                activePromises.add(scrapePromise);
            }
        };
        await processNext();
        while (activePromises.size > 0) {
            await Promise.race(activePromises);
        }
        logBoth(chalk.green('Scraping finished for all URLs'), requestId);
    }
    finally {
        logBoth(chalk.blue('Closing browser...'), requestId);
        await browser.close();
        logBoth(chalk.blue('Browser closed'), requestId);
    }
    const endTime = nodePerformance.now();
    const executionTime = (endTime - startTime) / 1000;
    logBoth(chalk.yellow(`Total execution time: ${executionTime.toFixed(2)} seconds`), requestId);
    return { resultsToReturn, resultsToStore };
};
const getCategories = async (signal, requestId) => {
    if (signal.aborted) {
        throw new Error('Aborted');
    }
    logBoth(chalk.blue('Starting browser...'), requestId);
    let categories = [];
    const browser = await puppeteer.launch({
        headless: true,
        args: [`--proxy-server=${PROXY_URL}`, '--window-size=1280,720'],
        executablePath: process.env.NODE_ENV === 'production'
            ? PUPPETEER_EXECUTABLE_PATH
            : puppeteer.executablePath(),
    });
    try {
        const page = await browser.newPage();
        await page.authenticate({
            username: PROXY_USERNAME,
            password: PROXY_PASSWORD,
        });
        logBoth(chalk.blue('Going to LOAD_URL:', LOAD_URL), requestId);
        await gotoWithTimeout(page, LOAD_URL, signal);
        const pageUrl = page.url();
        if (!pageUrl.includes(BASE_URL)) {
            throw new Error('Redirected to external page');
        }
        logBoth(chalk.blue('Arrived at page:', pageUrl), requestId);
        if (pageUrl.includes('selectPickupStore')) {
            await page.waitForSelector('button.white.pa0.mv2.bg-transparent.bn.dib.mh0.pointer > i');
            await page.click('button.white.pa0.mv2.bg-transparent.bn.dib.mh0.pointer > i');
            logBoth(chalk.magenta('Closing store selection sidebar'), requestId);
        }
        else {
            await page.waitForSelector('.ld.ld-ChevronUp.ml2.dn.db-m');
            await page.click('.ld.ld-ChevronUp.ml2.dn.db-m', { delay: 200 });
            logBoth(chalk.magenta('Closing store selection dropdown'), requestId);
        }
        await page.waitForSelector("[link-identifier='Departments'] > i"), { visible: false };
        await page.click("[link-identifier='Departments'] > i", { delay: 1000 });
        logBoth(chalk.magenta('Opening departments dropdown'), requestId);
        await page.waitForSelector("[link-identifier='viewAllDepartment']");
        const buttons = await page.$$('[link-identifier="viewAllDepartment"] + ul > li > button');
        logBoth(chalk.blue('Found potential categories:', buttons.length), requestId);
        for (let i = 1; i < buttons.length; i++) {
            const button = buttons[i];
            await button.click();
            const departmentList = await page.waitForSelector('.f6.list.ma0.normal.pa0.pb4');
            if (!departmentList) {
                logBoth(chalk.red('Department list not found'), requestId);
                continue;
            }
            const departmentItems = await departmentList.$$('li > a');
            const newCategories = await Promise.all(departmentItems.slice(1).map(async (item) => {
                return await item.evaluate((el) => {
                    return { name: el.textContent ?? 'Categoría', url: el.href };
                });
            }));
            categories = [...categories, ...newCategories];
        }
        logBoth(chalk.green('Finished getting URLs'), requestId);
    }
    catch (error) {
        logBoth(chalk.red('Error getting URLs:', error), requestId);
        return [];
    }
    finally {
        logBoth(chalk.blue('Closing browser...'), requestId);
        await browser.close();
        logBoth(chalk.blue('Browser closed'), requestId);
    }
    return categories.filter((category) => !category.url.includes('content'));
};
const scrapeItems = async (browser, url, signal, requestId) => {
    if (signal.aborted) {
        throw new Error('Aborted');
    }
    let allResults = [];
    let relevantResults = [];
    let currentPage = 1;
    let hasMorePages = true;
    try {
        while (hasMorePages) {
            if (signal.aborted) {
                throw new Error('Aborted');
            }
            const pageUrl = `${url}${currentPage > 1 ? `?page=${currentPage}` : ''}`;
            const { allItems, relevantItems, pageNotFound } = await scrapePage(browser, pageUrl, signal, requestId);
            if (pageNotFound) {
                hasMorePages = false;
                logBoth(chalk.magenta(`Stopping scraping for: ${url}`), requestId);
            }
            else {
                allResults = [...allResults, ...allItems];
                relevantResults = [...relevantResults, ...relevantItems];
                currentPage++;
            }
        }
        return { allResults, relevantResults };
    }
    catch (error) {
        logBoth(`${chalk.red('Error during scraping in scrapeItems:')} ${error}`, requestId);
        throw error;
    }
};
const setZipCode = async (zipCode, browser, signal, requestId) => {
    if (signal.aborted) {
        throw new Error('Aborted before setting ZIP code');
    }
    const page = await browser.newPage();
    await page.authenticate({
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD,
    });
    logBoth(chalk.blue('Going to base URL:', BASE_URL), requestId);
    await gotoWithTimeout(page, BASE_URL, signal);
    const url = page.url();
    if (!url.includes(BASE_URL)) {
        throw new Error('Redirected to external page');
    }
    logBoth(chalk.blue('Arrived at page:', url), requestId);
    logBoth(chalk.blue('Setting ZIP code...'), requestId);
    if (USE_ZIP_CODE && !url.includes('page')) {
        if (!url.includes('selectPickupStore')) {
            await page.waitForSelector("[data-automation-id='fulfillment-address'] > button");
            await page.click("[data-automation-id='fulfillment-address'] > button");
            logBoth(chalk.magenta('Clicked on store selection'), requestId);
        }
        logBoth(chalk.magenta('Waiting for input to appear...'), requestId);
        await page.waitForSelector('input.checkout-store-chooser-input', { timeout: 60000 });
        await page.click('input.checkout-store-chooser-input', { delay: 1000 });
        await page.$eval('input.checkout-store-chooser-input', (el) => (el.value = ''));
        await page.type('input.checkout-store-chooser-input', zipCode.toString(), { delay: 150 });
        logBoth(chalk.magenta('Typed ZIP code: ', zipCode), requestId);
        await page.waitForSelector("input[name='pickup-store']");
        await page.click("input[name='pickup-store']", { delay: 1500 });
        logBoth(chalk.magenta('Selected store'), requestId);
        await page.waitForSelector('[data-automation-id="save-label"]');
        await page.click('[data-automation-id="save-label"]', { delay: 1500 });
        logBoth(chalk.magenta('Saved store'), requestId);
        const waitDuration = 12000;
        logBoth(chalk.magenta(`Waiting for store selection to finish... (${waitDuration / 1000} seconds)`), requestId);
        await new Promise((resolve) => setTimeout(resolve, waitDuration));
        logBoth(chalk.blue('Store selection finished'), requestId);
        const localBytesTransferred = await page.evaluate(() => {
            const entries = window.performance.getEntriesByType('resource');
            return entries.reduce((total, entry) => {
                if (entry.transferSize) {
                    return total + entry.transferSize;
                }
                return total;
            }, 0);
        });
        logBoth(chalk.yellow(`${(localBytesTransferred / 1024 / 1024).toFixed(2)} MB`), requestId);
        totalBytesTransferred += localBytesTransferred;
        await page.close();
    }
};
const scrapePage = async (browser, scrapeUrl, signal, requestId) => {
    if (signal.aborted) {
        throw new Error('Aborted');
    }
    const page = await browser.newPage();
    await page.authenticate({
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD,
    });
    logBoth(chalk.cyan(`Going to page: ${scrapeUrl}`), requestId);
    try {
        await gotoWithTimeout(page, scrapeUrl, signal);
        const url = page.url();
        if (!url.includes(BASE_URL)) {
            throw new Error('Redirected to external page');
        }
        const pageResult = await page.evaluate(() => {
            let relevantItems = [];
            let allItems = [];
            const BYPASS_FILTERS = false;
            const addressDivs = document
                .querySelectorAll("[data-automation-id='fulfillment-address']")[1]
                ?.querySelectorAll('.f7') ?? [];
            const storeName = addressDivs[0]?.textContent ?? null;
            const storeAddress = addressDivs[1]?.textContent ?? null;
            const itemStack = document.querySelector("[data-testid='item-stack']");
            const itemElements = itemStack ? itemStack.querySelectorAll('[data-item-id]') : [];
            const pageNotFound = document.body.textContent.includes('No se pudo encontrar esta página.');
            if (pageNotFound) {
                return { allItems, relevantItems, pageNotFound };
            }
            itemElements.forEach((item) => {
                const id = item.getAttribute('data-item-id');
                const link = item.querySelector('a')?.href ?? null;
                const imageSrc = item.querySelector('img')?.src ?? null;
                const productPriceContainer = item.querySelector("[data-automation-id='product-price']");
                let currentPrice = null;
                let originalPrice = null;
                let discount = null;
                let brand = null;
                let productName = null;
                let ending = null;
                if (productPriceContainer) {
                    const currentPriceText = productPriceContainer.children[0]?.textContent ?? null;
                    if (currentPriceText) {
                        ending = currentPriceText.slice(-2);
                        currentPrice = Number(currentPriceText.replace('$', '').replace(',', ''));
                    }
                    const originalPriceText = productPriceContainer.children[2]?.textContent ?? null;
                    if (originalPriceText) {
                        originalPrice = Number(originalPriceText.replace('$', '').replace(',', ''));
                    }
                    discount =
                        originalPrice && currentPrice
                            ? ((originalPrice - currentPrice) / originalPrice) * 100
                            : null;
                    brand = productPriceContainer.nextElementSibling?.textContent ?? null;
                    productName =
                        productPriceContainer.nextElementSibling?.nextElementSibling?.firstElementChild
                            ?.textContent ?? null;
                }
                const parsedItem = {
                    id,
                    link,
                    imageSrc,
                    currentPrice,
                    originalPrice,
                    ending,
                    discount,
                    brand,
                    productName,
                    storeName,
                    storeAddress,
                };
                allItems.push(parsedItem);
                if (BYPASS_FILTERS ||
                    ending === '01' ||
                    ending === '02' ||
                    ending === '03' ||
                    (discount !== null && discount > 40)) {
                    relevantItems.push(parsedItem);
                }
            });
            return { allItems, relevantItems, pageNotFound };
        });
        logBoth(chalk.green('Scraping finished for page ' + scrapeUrl), requestId);
        const localBytesTransferred = await page.evaluate(() => {
            const entries = window.performance.getEntriesByType('resource');
            return entries.reduce((total, entry) => {
                if (entry.transferSize) {
                    return total + entry.transferSize;
                }
                return total;
            }, 0);
        });
        logBoth(chalk.yellow(`${(localBytesTransferred / 1024 / 1024).toFixed(2)} MB`), requestId);
        totalBytesTransferred += localBytesTransferred;
        await page.close();
        return pageResult;
    }
    catch (error) {
        await page.close();
        logBoth(chalk.red('Error scraping page:', error), requestId);
        throw error;
    }
};
app.post('/scrape', async (req, res) => {
    const requestId = req.body.requestId;
    let zipCode = req.body.zipCode;
    const abortController = new AbortController();
    abortControllers.set(requestId, abortController);
    log(chalk.yellow('Client requested scrape. requestID:', requestId));
    req.socket.on('close', () => {
        if (abortControllers.has(requestId)) {
            log(chalk.red('Client disconnected. Aborting scraping process. requestID:', requestId));
            abortController.abort();
            abortControllers.delete(requestId);
        }
    });
    try {
        logBoth(chalk.yellow('Starting scraping process'), requestId);
        if (zipCode)
            logBoth(chalk.cyan('ZIP code to use: ' + zipCode), requestId);
        else {
            zipCode = ZIP_CODE;
            logBoth(chalk.cyan('No ZIP code provided. Using default'), requestId);
        }
        logBoth(chalk.cyan('URLs to scrape:' + req.body.urls), requestId);
        const { resultsToReturn, resultsToStore } = await scrapeAllUrls(req.body.urls, abortController.signal, requestId, zipCode);
        logBoth(chalk.yellow('Scraping process finished'), requestId);
        logBoth(chalk.yellow(`Total transferred: ${(totalBytesTransferred / 1024 / 1024).toFixed(2)} MB`), requestId);
        logBoth(chalk.green('Total items found: ' + resultsToStore.length), requestId);
        logBoth(chalk.green('Relevant items found: ' + resultsToReturn.length), requestId);
        globalScrapedData = {
            json: resultsToReturn,
            csv: generateCsvString(resultsToStore),
        };
        res.json({
            success: true,
            message: 'Scraping completed. Data is ready for retrieval.',
            requestId,
        });
    }
    catch (error) {
        logBoth(chalk.red('Error during scraping main:', error), requestId);
        res.status(500).json({ success: false, error: error.message });
    }
});
app.get('/get-data', (_req, res) => {
    if (globalScrapedData) {
        res.json(globalScrapedData);
    }
    else {
        res.status(404).json({
            success: false,
            message: 'No scraped data available. Please run the scraper first.',
        });
    }
});
app.get('/get-categories/:requestId', async (req, res) => {
    const requestId = req.params.requestId;
    if (!requestId) {
        res.status(400).json({ success: false, message: 'Request ID not provided' });
        return;
    }
    const abortController = new AbortController();
    abortControllers.set(requestId, abortController);
    req.socket.on('close', () => {
        if (abortControllers.has(requestId)) {
            log(chalk.red('Client disconnected. Aborting get category process. requestID:', requestId));
            abortController.abort();
            abortControllers.delete(requestId);
        }
    });
    logBoth(chalk.yellow('Fetching categories...'), requestId);
    const categories = await getCategories(abortController.signal, requestId);
    res.json(categories);
});
app.listen(PORT, () => {
    log(chalk.green(`Server listening at http://localhost:${PORT}`));
});
app.get('/logs', (req, res) => {
    const requestId = crypto.randomUUID();
    log(chalk.yellow('Client connected to logs endpoint. requestID:', requestId));
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    sseClients.set(requestId, res);
    const returnMessage = JSON.stringify({ message: 'Connected to logs endpoint :)', requestId });
    sseClients.get(requestId)?.write(`data: ${returnMessage}\n\n`);
    req.on('close', () => {
        log(chalk.red('Client disconnected from logs endpoint. requestID:', requestId));
        sseClients.delete(requestId);
    });
});
export default app;
