import express, { Request, Response } from 'express';
import puppeteer from 'puppeteer-extra';
import BlockResourcesPlugin from 'puppeteer-extra-plugin-block-resources';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import cors from 'cors';
import { performance as nodePerformance } from 'perf_hooks';
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY, Browser, Page } from 'puppeteer';
import chalk from 'chalk';
import { Result, ScrapedData, Category, APIScrapeResponse } from '../shared-types';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

const log = console.log;
const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const BODEGA_BASE_URL = 'https://despensa.bodegaaurrera.com.mx';
const BODEGA_LOAD_URL = 'https://despensa.bodegaaurrera.com.mx';
/* const WALMART_BASE_URL = 'https://super.walmart.com.mx/';
const WALMART_LOAD_URL = 'https://super.walmart.com.mx/'; */

const MAX_CONCURRENT_PAGES = 5;
const ZIP_CODE = '01000';
const USE_ZIP_CODE = true;

const abortControllers = new Map<string, AbortController>();
const abortHandlers = new WeakMap<AbortSignal, () => void>();
const sseClients = new Map<string, Response>();

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

const BRP = BlockResourcesPlugin({
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
});

puppeteer
  .use(BRP)
  /*   .use(StealthPlugin()) */
  .use(
    AdblockerPlugin({
      blockTrackers: true,
      interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
    }),
  )
  .use(StealthPlugin());

const logBoth = (message: string, requestId: string) => {
  console.log(message);
  const sseRes = sseClients.get(requestId);
  if (sseRes) {
    sseRes.write(`data: ${JSON.stringify({ message })}\n\n`);
  }
};

const generateCsvString = (items: Result[]): string => {
  const headers: (keyof Result)[] = [
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

const gotoWithTimeout = async (page: Page, url: string, signal: AbortSignal, timeout = 300000) => {
  const abortPromise = new Promise((_, reject) => {
    let abortHandler = abortHandlers.get(signal);

    if (abortHandler) {
      signal.removeEventListener('abort', abortHandler);
    }

    abortHandler = () => {
      reject(new Error('Goto aborted because client disconnected'));
    };

    abortHandlers.set(signal, abortHandler);
    signal.addEventListener('abort', abortHandler, { once: true });
  });

  try {
    return await Promise.race([
      page.goto(url, { timeout, waitUntil: 'networkidle0' }),
      abortPromise,
    ]);
  } catch (error) {
    if (signal.aborted) {
      throw new Error('Navigation aborted because client disconnected');
    }
    throw error;
  }
};

const scrapeAllUrls = async (
  store: string,
  urls: string[],
  signal: AbortSignal,
  requestId: string,
  zipCode: string,
): Promise<{
  resultsToReturn: Result[];
  resultsToStore: Result[];
  totalBytesTransferred: number;
}> => {
  if (signal.aborted) {
    throw new Error('Aborted before starting browser');
  }

  BRP.blockedTypes.add('stylesheet');

  logBoth(chalk.gray('Starting browser...'), requestId);
  const browser = await puppeteer.launch({
    headless: store === 'bodega' ? true : false,
    args: [`--proxy-server=${PROXY_URL}`],
    executablePath:
      process.env.NODE_ENV === 'production'
        ? PUPPETEER_EXECUTABLE_PATH
        : puppeteer.executablePath(),
  });
  let resultsToReturn: Result[] = [];
  let resultsToStore: Result[] = [];
  let totalBytesTransferred = 0;
  const startTime = nodePerformance.now();

  try {
    totalBytesTransferred += await setZipCode(store, zipCode, browser, signal, requestId);

    const queue = [...urls];
    const activePromises = new Set<Promise<void>>();

    const processNext = async () => {
      while (queue.length > 0 && activePromises.size < MAX_CONCURRENT_PAGES) {
        if (signal.aborted) {
          throw new Error('Aborted before processing next page');
        }

        const targetUrl = queue.shift()!;

        const scrapePromise = scrapeItems(store, browser, targetUrl, signal, requestId)
          .then((resultObject) => {
            resultsToReturn = [...resultsToReturn, ...resultObject.relevantResults];
            resultsToStore = [...resultsToStore, ...resultObject.allResults];
            totalBytesTransferred += resultObject.bytesTransferred;
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
  } finally {
    logBoth(chalk.gray('Closing browser...'), requestId);
    await browser.close();
    logBoth(chalk.gray('Browser closed'), requestId);
  }

  const endTime = nodePerformance.now();
  const executionTime = (endTime - startTime) / 1000;
  logBoth(chalk.yellow(`Total execution time: ${executionTime.toFixed(2)} seconds`), requestId);

  return { resultsToReturn, resultsToStore, totalBytesTransferred };
};

const getCategories = async (
  store: string,
  signal: AbortSignal,
  requestId: string,
  zipCode: string,
): Promise<Category[]> => {
  if (signal.aborted) {
    throw new Error('Aborted');
  }

  logBoth(chalk.gray('Starting browser...'), requestId);

  let categories: Category[] = [];

  const browser = await puppeteer.launch({
    headless: store === 'bodega' ? true : false,
    args: [`--proxy-server=${PROXY_URL}`, '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 },
    executablePath:
      process.env.NODE_ENV === 'production'
        ? PUPPETEER_EXECUTABLE_PATH
        : puppeteer.executablePath(),
  });

  try {
    await setZipCode(store, zipCode, browser, signal, requestId);
    const page = await browser.newPage();
    await page.authenticate({
      username: PROXY_USERNAME,
      password: PROXY_PASSWORD,
    });

    if (store === 'bodega') {
      logBoth(
        chalk.gray(`Getting categories using ZIP code ${zipCode} from ${BODEGA_LOAD_URL}`),
        requestId,
      );

      await gotoWithTimeout(page, BODEGA_LOAD_URL, signal);
    } /* else if (store === 'walmart') {
      logBoth(
        chalk.gray(`Getting categories using ZIP code ${zipCode} from ${WALMART_LOAD_URL}`),
        requestId,
      );

      await gotoWithTimeout(page, WALMART_LOAD_URL, signal);
    } */

    const pageUrl = page.url();

    /*   if (!pageUrl.includes(BODEGA_BASE_URL || WALMART_BASE_URL)) {
      throw new Error('Redirected to external page: ' + pageUrl);
    } */

    logBoth(chalk.gray('Arrived at page:', pageUrl), requestId);

    await page.waitForSelector("[link-identifier='Departments'] > i"), { visible: false };
    await page.click("[link-identifier='Departments'] > i", { delay: 3000 });
    logBoth(chalk.magenta('Opening departments dropdown'), requestId);

    await page.waitForSelector("[link-identifier='viewAllDepartment']");

    const buttons = await page.$$('[link-identifier="viewAllDepartment"] + ul > li > button');
    logBoth(chalk.gray('Found potential categories:', buttons.length), requestId);

    for (let i = 1; i < buttons.length; i++) {
      const button = buttons[i];
      await button.click();

      let departmentList;
      if (store === 'bodega')
        departmentList = await page.waitForSelector('.f6.list.ma0.normal.pa0.pb4');
      /* else if (store === 'walmart')
        departmentList = await page.waitForSelector('[data-testid="category-menu"]'); */
      if (!departmentList) {
        logBoth(chalk.red('Department list not found'), requestId);
        continue;
      }

      let departmentItems;
      if (store === 'bodega') departmentItems = await departmentList.$$('li > a');
      /*  else if (store === 'walmart')
        departmentItems = await departmentList.$$('.f6.list.ma0.normal.pa0.pb4 li > a'); */

      if (!departmentItems) {
        logBoth(chalk.red('Department items not found'), requestId);
        continue;
      }

      const newCategories = await Promise.all(
        departmentItems.slice(1).map(async (item) => {
          return await item.evaluate((el) => {
            if (el.textContent === 'Ver todo') return { name: 'Ver todo', url: '' };
            return { name: el.textContent ?? 'Categoría', url: el.href };
          });
        }),
      );

      categories = [...categories, ...newCategories];
    }

    logBoth(chalk.green('Finished getting URLs'), requestId);
  } catch (error) {
    logBoth(chalk.red('Error getting URLs:', error), requestId);
    return [];
  } finally {
    logBoth(chalk.gray('Closing browser...'), requestId);
    await browser.close();
    logBoth(chalk.gray('Browser closed'), requestId);
  }

  const filteredCategories = categories
    .filter((category) => !category.url.includes('content'))
    .filter((category) => category.url !== '');
  const uniqueCategories = filteredCategories.reduce((acc: Category[], current) => {
    const x = acc.find((item) => item.url === current.url);
    if (!x) {
      return acc.concat([current]);
    } else {
      return acc;
    }
  }, []);

  logBoth(chalk.gray('Categories fetched: ' + uniqueCategories.length), requestId);

  return uniqueCategories;
};

const scrapeItems = async (
  store: string,
  browser: Browser,
  url: string,
  signal: AbortSignal,
  requestId: string,
): Promise<{ allResults: Result[]; relevantResults: Result[]; bytesTransferred: number }> => {
  if (signal.aborted) {
    throw new Error('Aborted');
  }

  let allResults: Result[] = [];
  let relevantResults: Result[] = [];
  let currentPage = 1;
  let hasMorePages = true;
  let bytesTransferred = 0;

  try {
    while (hasMorePages) {
      if (signal.aborted) {
        throw new Error('Aborted');
      }

      const pageUrl = `${url}${currentPage > 1 ? `?page=${currentPage}` : ''}`;
      const {
        allItems,
        relevantItems,
        pageNotFound,
        bytesTransferred: pageBytes,
      } = await scrapePage(store, browser, pageUrl, signal, requestId);

      if (pageNotFound) {
        hasMorePages = false;
        logBoth(chalk.magenta(`Stopping scraping for: ${url}`), requestId);
      } else {
        allResults = [...allResults, ...allItems];
        relevantResults = [...relevantResults, ...relevantItems];
        bytesTransferred += pageBytes;
        currentPage++;
      }
    }

    return { allResults, relevantResults, bytesTransferred };
  } catch (error) {
    logBoth(`${chalk.red('Error during scraping in scrapeItems:')} ${error}`, requestId);
    throw error;
  }
};

const setZipCode = async (
  store: string,
  zipCode: string,
  browser: Browser,
  signal: AbortSignal,
  requestId: string,
): Promise<number> => {
  if (signal.aborted) {
    throw new Error('Aborted before setting ZIP code');
  }

  let bytesTransferred = 0;
  const page = await browser.newPage();
  await page.authenticate({
    username: PROXY_USERNAME,
    password: PROXY_PASSWORD,
  });

  if (store === 'bodega') {
    logBoth(chalk.gray(`Going to set ZIP code ${zipCode} in ${BODEGA_LOAD_URL}`), requestId);
    await gotoWithTimeout(page, BODEGA_LOAD_URL, signal);
  } /*  else if (store === 'walmart') {
    logBoth(chalk.gray(`Going to set ZIP code ${zipCode} in ${WALMART_LOAD_URL}`), requestId);
    await gotoWithTimeout(page, WALMART_LOAD_URL, signal);
  } */

  const url = page.url();

  /*  if (!url.includes(BODEGA_BASE_URL || WALMART_BASE_URL)) {
    throw new Error('Redirected to external page');
  } */

  logBoth(chalk.gray('Arrived at page:', url), requestId);
  logBoth(chalk.gray('Setting ZIP code...'), requestId);

  if (USE_ZIP_CODE && !url.includes('page')) {
    if (!url.includes('selectPickupStore')) {
      await page.waitForSelector("[data-automation-id='fulfillment-address'] > button");
      await page.click("[data-automation-id='fulfillment-address'] > button");
      logBoth(chalk.magenta('Clicked on store selection'), requestId);
    }

    logBoth(chalk.magenta('Waiting for input to appear...'), requestId);
    await page.waitForSelector('input.checkout-store-chooser-input', { timeout: 60000 });
    await page.click('input.checkout-store-chooser-input', { delay: 3000 });
    await page.$eval(
      'input.checkout-store-chooser-input',
      (el: HTMLInputElement) => (el.value = ''),
    );
    await page.type('input.checkout-store-chooser-input', zipCode.toString(), { delay: 250 });

    logBoth(chalk.magenta('Typed ZIP code: ', zipCode), requestId);
    await page.waitForSelector("input[name='pickup-store']");
    await page.click("input[name='pickup-store']", { delay: 2000 });
    logBoth(chalk.magenta('Selected store'), requestId);
    await page.waitForSelector('[data-automation-id="save-label"]');
    await page.click('[data-automation-id="save-label"]', { delay: 1000 });
    logBoth(chalk.magenta('Saved store'), requestId);

    const waitDuration = 8000;
    logBoth(
      chalk.magenta(`Waiting for store selection to finish... (${waitDuration / 1000} seconds)`),
      requestId,
    );
    await new Promise((resolve) => setTimeout(resolve, waitDuration));
    logBoth(chalk.gray('Store selection finished'), requestId);

    bytesTransferred = await page.evaluate(() => {
      const entries = window.performance.getEntriesByType('resource');
      return entries.reduce((total, entry: any) => {
        if (entry.transferSize) {
          return total + entry.transferSize;
        }
        return total;
      }, 0);
    });

    logBoth(chalk.yellow(`${(bytesTransferred / 1024).toFixed(2)} KB transferred`), requestId);

    await page.close();
  }
  return bytesTransferred;
};

const scrapePage = async (
  store: string,
  browser: Browser,
  scrapeUrl: string,
  signal: AbortSignal,
  requestId: string,
): Promise<{
  allItems: Result[];
  relevantItems: Result[];
  pageNotFound: boolean;
  bytesTransferred: number;
}> => {
  if (signal.aborted) {
    throw new Error('Aborted');
  }

  const page = await browser.newPage();
  await page.authenticate({
    username: PROXY_USERNAME,
    password: PROXY_PASSWORD,
  });
  let bytesTransferred = 0;
  try {
    logBoth(chalk.gray(`Going to scrape page: ${scrapeUrl}`), requestId);
    await gotoWithTimeout(page, scrapeUrl, signal);

    const url = page.url();
    /*  if (!url.includes(BODEGA_BASE_URL || WALMART_BASE_URL)) {
      throw new Error('Redirected to external page');
    } */

    const { relevantItems, allItems, pageNotFound } = await page.evaluate(() => {
      let relevantItems: Result[] = [];
      let allItems: Result[] = [];
      const BYPASS_FILTERS = false;

      const addressDivs =
        document
          .querySelectorAll("[data-automation-id='fulfillment-address']")[1]
          ?.querySelectorAll('.f7') ?? [];

      const storeName = addressDivs[0]?.textContent ?? null;
      const storeAddress = addressDivs[1]?.textContent ?? null;

      const itemStack = document.querySelector("[data-testid='item-stack']");
      const itemElements = itemStack ? itemStack.querySelectorAll('[data-item-id]') : [];
      let pageNotFound = false;
      pageNotFound =
        document.body.textContent!.includes('No se pudo encontrar esta página.') ||
        document.body.textContent!.includes('Lo sentimos');
      if (pageNotFound) {
        return { allItems, relevantItems, pageNotFound };
      }

      itemElements.forEach((item) => {
        const id = item.getAttribute('data-item-id');
        const link = item.querySelector('a')?.href ?? null;
        const imageSrc = item.querySelector('img')?.src ?? null;
        const productPriceContainer = item.querySelector("[data-automation-id='product-price']");

        let currentPrice: number | null = null;
        let originalPrice: number | null = null;
        let discount: number | null = null;
        let brand: string | null = null;
        let productName: string | null = null;
        let ending: string | null = null;

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

        const parsedItem: Result = {
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

        if (
          BYPASS_FILTERS ||
          ending === '01' ||
          ending === '02' ||
          ending === '03' ||
          (discount !== null && discount > 40)
        ) {
          relevantItems.push(parsedItem);
        }
      });

      return { allItems, relevantItems, pageNotFound };
    });

    logBoth(chalk.green('Scraping finished for page ' + scrapeUrl), requestId);

    bytesTransferred += await page.evaluate(() => {
      const entries = window.performance.getEntriesByType('resource');
      return entries.reduce((total, entry: any) => {
        if (entry.transferSize) {
          return total + entry.transferSize;
        }
        return total;
      }, 0);
    });

    logBoth(chalk.yellow(`${(bytesTransferred / 1024).toFixed(2)} KB transferred`), requestId);

    const pageResult = { allItems, relevantItems, pageNotFound, bytesTransferred };

    await page.close();
    return pageResult;
  } catch (error) {
    await page.close();
    logBoth(chalk.red('Error scraping page:', error), requestId);
    throw error;
  }
};

app.post('/scrape', async (req: Request, res: Response) => {
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
    if (zipCode) logBoth(chalk.cyan('ZIP code to use: ' + zipCode), requestId);
    else {
      zipCode = ZIP_CODE;
      logBoth(chalk.cyan('No ZIP code provided. Using default: ', zipCode), requestId);
    }

    logBoth(chalk.cyan(`${req.body.urls.length} URLs to scrape`), requestId);
    const { resultsToReturn, resultsToStore, totalBytesTransferred } = await scrapeAllUrls(
      req.body.store,
      req.body.urls,
      abortController.signal,
      requestId,
      String(zipCode),
    );
    logBoth(chalk.yellow('Scraping process finished'), requestId);
    logBoth(
      chalk.yellow(
        `Total transferred: ${(totalBytesTransferred / 1024).toFixed(2)} KB transferred`,
      ),
      requestId,
    );

    logBoth(chalk.green('Total items found: ' + resultsToStore.length), requestId);
    logBoth(chalk.green('Relevant items found: ' + resultsToReturn.length), requestId);
    const scrapedData: ScrapedData = {
      json: resultsToReturn,
      csv: generateCsvString(resultsToStore),
    };

    const response: APIScrapeResponse = { success: true, scrapedData };

    res.json(response);
  } catch (error) {
    logBoth(chalk.red('Error during scraping main:', error), requestId);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/get-categories/:requestId', async (req: Request, res: Response) => {
  const requestId = req.params.requestId;
  let zipCode = req.query.zip as string;
  let store = String(req.query.store);

  if (!requestId) {
    res.status(400).json({ success: false, message: 'Request ID not provided' });
    return;
  }

  if (zipCode) logBoth(chalk.cyan('ZIP code to use: ' + zipCode), requestId);
  else {
    zipCode = ZIP_CODE;
    logBoth(chalk.cyan('No ZIP code provided. Using default: ', zipCode), requestId);
  }

  if (store) logBoth(chalk.cyan('Store to use: ' + store), requestId);
  else {
    store = 'bodega';
    logBoth(chalk.cyan('No store provided. Using default: ', store), requestId);
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

  const categories = await getCategories(store, abortController.signal, requestId, zipCode);
  res.json(categories);
});

app.get('/logs', (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();

  log(chalk.yellow('Client connected to logs endpoint. requestID:', requestId));

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  sseClients.set(requestId, res);

  const returnMessage = JSON.stringify({
    message: chalk.green('Connected to log events'),
    requestId,
  });

  sseClients.get(requestId)?.write(`data: ${returnMessage}\n\n`);

  req.on('close', () => {
    log(chalk.red('Client disconnected from logs endpoint. requestID:', requestId));
    sseClients.delete(requestId);
  });
});

app.get('/ping', (_req: Request, res: Response) => {
  log(chalk.green('Ping received at:', new Date().toISOString()));
  res.json({ success: true });
});

app.get('/proxy-status', async (_req: Request, res: Response) => {
  try {
    const auth = Buffer.from(`${PROXY_USERNAME}:${PROXY_PASSWORD}`).toString('base64');
    const response = await fetch(
      'https://gw.dataimpulse.com:777/api/stats',
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    if (!response.ok) {
      throw new Error('Proxy API response was not ok');
    }
    const json = await response.json();
    res.json({ success: true, trafficLeft: json.traffic_left, trafficTotal: json.total_traffic, proxyStatus: json.status });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
      res.json({ success: false, error: error.message });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  log(chalk.green(`Server listening at port ${PORT}`));
});
export default app;
