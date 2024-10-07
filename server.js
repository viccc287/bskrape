import express from 'express';
import puppeteer from 'puppeteer-extra';
import blockResourcesPlugin from 'puppeteer-extra-plugin-block-resources';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import cors from 'cors';
import { performance } from 'perf_hooks';
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from 'puppeteer';
import chalk from 'chalk';
import fs from 'fs';

const log = console.log;
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const BASE_URL = 'https://despensa.bodegaaurrera.com.mx';
const URLS = [
/*   '/browse/hogar-y-accesorios/linea-blanca/01_0113',
  '/browse/hogar-y-accesorios/blancos-y-colchones/01_0107',
  '/browse/hogar-y-accesorios/ferreteria-y-accesorios-autos/01_0110',
  '/browse/hogar-y-accesorios/electrodomesticos/01_0109',
  '/browse/hogar-y-accesorios/accesorios-cocina/01_0101',
  '/browse/hogar-y-accesorios/pintura/01_0117',
  '/browse/hogar-y-accesorios/organizacion-y-almacenamiento/01_0115',
  '/browse/hogar-y-accesorios/accesorios-mesa/01_0102',
  '/browse/hogar-y-accesorios/articulos-jardineria/01_0112',
  '/browse/hogar-y-accesorios/muebles-y-decoracion/01_0108',
  '/browse/hogar-y-accesorios/campismo-y-natacion/01_0111', 
  '/browse/hogar-y-accesorios/papeleria/01_0116',
  */
  '/browse/hogar-y-accesorios/pilas-y-baterias/01_0119',
  '/browse/hogar-y-accesorios/inhalantes/01_0120',
  /*'/browse/hogar-y-accesorios/prichos/01_0122',
   '/browse/hogar-y-accesorios/articulos-de-temporada/01_0104',
  '/browse/hogar-y-accesorios/articulos-deportivos/01_0105',
  '/browse/hogar-y-accesorios/articulos-fiesta/01_0106',
  '/browse/hogar-y-accesorios/articulos-lavanderia/01_0103',
  '/browse/despensa-y-abarrotes/aceites-de-cocina/06_0601',
  '/browse/despensa-y-abarrotes/alimentos-instantaneos/06_0602',
  '/browse/despensa-y-abarrotes/azucar-y-sustitutos/06_0605',
  '/browse/despensa-y-abarrotes/botanas/06_0606',
  '/browse/despensa-y-abarrotes/cafe-te-y-sustitutos-de-crema/06_0607',
  '/browse/despensa-y-abarrotes/cereales-y-barras-energeticas/06_0608',
  '/browse/despensa-y-abarrotes/chocolates-y-dulces/06_0610',
  '/browse/despensa-y-abarrotes/consomes-salsas-y-aderezos/06_0620',
  '/browse/despensa-y-abarrotes/enlatados-y-conservas/06_0611',
  '/browse/despensa-y-abarrotes/frijol-arroz-y-semillas/06_0604',
  '/browse/despensa-y-abarrotes/galletas-dulces-y-saladas/06_0613',
  '/browse/despensa-y-abarrotes/harina-y-polvo-para-hornear/06_0614',
  '/browse/despensa-y-abarrotes/pan-y-tortillas-empacados/06_0617',
  '/browse/despensa-y-abarrotes/pastas-y-sopas/06_0618',
  '/browse/despensa-y-abarrotes/sazonadores-y-especias/06_0612',
  '/browse/despensa-y-abarrotes/jarabes-saborizantes/06_0619',
  '/browse/despensa-y-abarrotes/leche/06_0615',
  '/browse/despensa-y-abarrotes/miel-y-mermelada/06_0616',
  '/browse/bebidas-y-jugos/polvos-y-jarabes-saborizantes/11_1105',
  '/browse/bebidas-y-jugos/agua-embotellada/11_1101',
  '/browse/bebidas-y-jugos/bebidas-energizantes-e-isotonicas/11_1103',
  '/browse/bebidas-y-jugos/nectares-y-jugos/11_1104',
  '/browse/bebidas-y-jugos/refrescos/11_1106',
  '/browse/lacteos-y-cremeria/alimento-liquido/12_1201',
  '/browse/lacteos-y-cremeria/crema/12_1202',
  '/browse/lacteos-y-cremeria/gelatinas-y-postres-preparados/12_1203',
  '/browse/lacteos-y-cremeria/huevo/12_1204',
  '/browse/lacteos-y-cremeria/leche/12_1205',
  '/browse/lacteos-y-cremeria/mantequilla-y-margarina/12_1206',
  '/browse/lacteos-y-cremeria/yogurt/12_1207',
  '/browse/electronica-y-computacion/pantallas/07_0707',
  '/browse/electronica-y-computacion/videojuegos/07_0708',
  '/browse/electronica-y-computacion/smartphones/07_0706',
  '/browse/electronica-y-computacion/computacion/07_0703',
  '/browse/electronica-y-computacion/audifonos-y-bocinas/07_0701',
  '/browse/detergente-suavizante-y-limpieza-del-hogar/accesorios-limpieza/13_1301',
  '/browse/detergente-suavizante-y-limpieza-del-hogar/aromatizantes-el-hogar/13_1302',
  '/browse/detergente-suavizante-y-limpieza-del-hogar/articulos-de-lavanderia/13_1303',
  '/browse/detergente-suavizante-y-limpieza-del-hogar/platos-vasos-y-cubiertos-desechables/13_1304',
  '/browse/detergente-suavizante-y-limpieza-del-hogar/jabon-lavatrastes-y-lavavajillas/13_1305',
  '/browse/detergente-suavizante-y-limpieza-del-hogar/limpieza-del-hogar/13_1306',
  '/browse/detergente-suavizante-y-limpieza-del-hogar/papel-higienico/13_1308',
  '/browse/higiene-personal-y-belleza/higiene-hombre/10_1009',
  '/browse/higiene-personal-y-belleza/higiene-corporal/10_1010',
  '/browse/higiene-personal-y-belleza/higiene-manos/10_1011',
  '/browse/higiene-personal-y-belleza/panuelos-desechables/10_1012',
  '/browse/higiene-personal-y-belleza/kits-de-viaje/10_1013',
  '/browse/higiene-personal-y-belleza/inhalantes/10_1015',
  '/browse/higiene-personal-y-belleza/articulos-afeitar/10_1002',
  '/browse/higiene-personal-y-belleza/maquillaje-y-cosmeticos/10_1003',
  '/browse/higiene-personal-y-belleza/cuidado-bucal/10_1004',
  '/browse/higiene-personal-y-belleza/cuidado-del-cabello/10_1005',
  '/browse/higiene-personal-y-belleza/cuidado-facial/10_1006',
  '/browse/higiene-personal-y-belleza/cuidado-intimo/10_1007',
  '/browse/higiene-personal-y-belleza/cuidado-pies/10_1008',
  '/browse/articulos-bebes-y-ninos/juguetirama/02_0208',
  '/browse/articulos-bebes-y-ninos/panales-y-toallitas-bebe/02_0210',
  '/browse/articulos-bebes-y-ninos/formula-lactea/02_0206',
  '/browse/articulos-bebes-y-ninos/higiene-del-bebe/02_0207',
  '/browse/articulos-bebes-y-ninos/comida-bebe-y-lactancia/02_0204',
  '/browse/articulos-bebes-y-ninos/cunas-carriolas-y-accesorios/02_0205',
  '/browse/articulos-bebes-y-ninos/ropa-bebe/02_0211',
  '/browse/farmacia/medicamentos-estomacales/08_0806',
  '/browse/farmacia/medicamentos-de-patente/08_0809',
  '/browse/farmacia/medicamentos-respiratorios/08_0813',
  '/browse/farmacia/analgesicos/08_0801',
  '/browse/farmacia/vitaminas-y-suplementos/08_0814',
  '/browse/farmacia/medicamentos-oftalmicos-y-opticos/08_0811',
  '/browse/farmacia/incontinencia/08_0807',
  '/browse/farmacia/cuidado-personal/08_0803',
  '/browse/farmacia/bienestar-sexual/08_0802',
  '/browse/farmacia/material-de-curacion/08_0808',
  '/browse/farmacia/ortopedia-y-equipos-de-medicion/08_0812',
  '/browse/farmacia/para-la-diabetes/08_0804',
  '/browse/farmacia/medicamentos-naturistas-y-herbolarios/08_0810',
  '/browse/carnes-mariscos-y-pescados/pollo-y-pavo/03_0303',
  '/browse/carnes-mariscos-y-pescados/carne-de-res/03_0304',
  '/browse/carnes-mariscos-y-pescados/carne-de-cerdo/03_0301',
  '/browse/carnes-mariscos-y-pescados/pescados-y-mariscos/03_0302',
  '/browse/frutas-y-verduras/verduras/09_0902',
  '/browse/frutas-y-verduras/frutas/09_0901',
  '/browse/frutas-y-verduras/articulos-a-granel/09_0903',
  '/browse/alimento-y-accesorios-mascotas/perros/17_1701',
  '/browse/alimento-y-accesorios-mascotas/gatos/17_1702',
  '/browse/alimento-y-accesorios-mascotas/arena-y-areneros/17_1703',
  '/browse/alimento-y-accesorios-mascotas/accesorios-perro/17_1705',
  '/browse/alimento-y-accesorios-mascotas/accesorios-gato/17_1706',
  '/browse/alimento-y-accesorios-mascotas/higiene-y-salud-tu-mascota/17/1704',
  '/browse/alimento-y-accesorios-mascotas/otras-mascotas/17/1707',
  '/browse/congelados/hielo/05_0503',
  '/browse/congelados/postres-congelados/05_0504',
  '/browse/congelados/comida-congelada/05_0501',
  '/browse/congelados/frutas-y-verduras-congeladas/05_0502',
  '/browse/salchichoneria/carnes-frias/16_1601',
  '/browse/salchichoneria/articulos-empacados/16_1602',
  '/browse/salchichoneria/quesos/16_1603',
  '/browse/ropa-y-zapateria/ropa-interior-dama/15_1502',
  '/browse/ropa-y-zapateria/ropa-interior-caballero/15_1507',
  '/browse/ropa-y-zapateria/damas-casual/15_1501',
  '/browse/ropa-y-zapateria/pijamas-dama/15_1503',
  '/browse/ropa-y-zapateria/caballero-casual/15_1506',
  '/browse/ropa-y-zapateria/ropa-deportiva-dama/15_1504',
  '/browse/ropa-y-zapateria/ropa-deportiva-caballero/15_1508',
  '/browse/ropa-y-zapateria/ninas/15_1511',
  '/browse/ropa-y-zapateria/ropa-interior-ninas/15_1513',
  '/browse/ropa-y-zapateria/ninos/15_1510',
  '/browse/ropa-y-zapateria/ropa-interior-ninos/15_1512',
  '/browse/ropa-y-zapateria/zapateria-dama/15_1505',
  '/browse/ropa-y-zapateria/zapateria-caballero/15_1509',
  '/browse/ropa-y-zapateria/zapateria-infantil/15_1514',
  '/browse/ropa-y-zapateria/accesorios/15_1515',
  '/browse/tortilleria-y-panaderia/tortilleria/14_1406',
  '/browse/tortilleria-y-panaderia/pan-salado/14_1404',
  '/browse/tortilleria-y-panaderia/pan-dulce/14_1403',
  '/browse/tortilleria-y-panaderia/pasteleria-y-reposteria/14_1405',
  '/browse/tortilleria-y-panaderia/comida-preparada/14_1401',
  '/browse/tortilleria-y-panaderia/mas-articulos-de-tortilleria-y-panaderia/14_1402' */
];

const MAX_CONCURRENT_PAGES = 2;
const ZIP_CODE = '97000';
const USE_ZIP_CODE = true;

const PROXY_URL = 'gw.dataimpulse.com:823';
const username = '6d31e2eb94dfddd886eb';
const password = 'a3db2c7025f0eb44';

const exportToCsv = (items) => {
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

  const csvString = csvRows.join('\n');

  fs.writeFileSync('output.csv', csvString, 'utf8');
  log(chalk.green('CSV file created successfully as output.csv'));
};

puppeteer.use(
  blockResourcesPlugin({
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
      /* 'stylesheet' */,
    ]),
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  }),
);
puppeteer.use(StealthPlugin());
puppeteer.use(
  AdblockerPlugin({
    blockTrackers: true,
    interceptResolutinPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  }),
);

const scrapeAllUrls = async () => {
  log(chalk.blue('Opening browser...'));
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--proxy-server=${PROXY_URL}`],
  });
  let resultsToReturn = [];
  let resultsToStore = [];
  const startTime = performance.now();

  await setZipCode(browser);

  try {
    const queue = [...URLS];
    const activePromises = new Set();

    const processNext = async () => {
      while (queue.length > 0 && activePromises.size < MAX_CONCURRENT_PAGES) {
        const relativeUrl = queue.shift();
        const fullUrl = BASE_URL + relativeUrl;

        const scrapePromise = scrapeItems(browser, fullUrl)
          .then((resultObject) => {
            resultsToReturn = [...resultsToReturn, ...resultObject.relevantResults];
            resultsToStore = [...resultsToStore, ...resultObject.allResults];
          })
          .catch((error) => {
            log(chalk.red(`Error scraping ${relativeUrl}:`), error);
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

    log(chalk.green('Scraping finished for all URLs'));
  } catch (error) {
    log(`${chalk.red('Error during scraping main:')} ${error}`);
  } finally {
    log(chalk.blue('Closing browser...'));
    await browser.close();
  }

  const endTime = performance.now();
  const executionTime = (endTime - startTime) / 1000;
  log(chalk.yellow(`Total execution time: ${executionTime.toFixed(2)} seconds`));

  exportToCsv(resultsToStore);
  return resultsToReturn;
};

const scrapeItems = async (browser, url) => {
  let allResults = [];
  let relevantResults = [];
  let currentPage = 1;
  let hasMorePages = true;

  try {
    while (hasMorePages) {
      const pageUrl = `${url}${currentPage > 1 ? `?page=${currentPage}` : ''}`;
      const { allItems, relevantItems, pageNotFound } = await scrapePage(browser, pageUrl);

      if (pageNotFound) {
        hasMorePages = false;
        log(chalk.magenta(`Stopping scraping for: ${url}`));
      } else {
        allResults = [...allResults, ...allItems];
        relevantResults = [...relevantResults, ...relevantItems];
        currentPage++;
      }
    }

    return { allResults, relevantResults };
  } catch (error) {
    log(`${chalk.red('Error during scraping in scrapeItems:')} ${error}`);
    throw error;
  }
};


const setZipCode = async (browser) => { 

  log(chalk.blue('Setting ZIP code...'));

  const page = await browser.newPage();
  await page.authenticate({
    username,
    password,
  });

  await page.goto(BASE_URL, { timeout: 120000, waitUntil: 'networkidle0' });

  const url = await page.url();
  log(chalk.green(`Arrived at page: ${url}`));
  

  if (USE_ZIP_CODE && !url.includes('page')) {

    if (!url.includes('selectPickupStore')) {
      await page.waitForSelector('[data-automation-id="fulfillment-banner"]');
      await page.click('[data-automation-id="fulfillment-banner"]');
      log(chalk.magenta('Clicked on banner'));

      await page.waitForSelector("[data-automation-id='fulfillment-address'] > button");
      await page.click("[data-automation-id='fulfillment-address'] > button");
      log(chalk.magenta('Clicked on store selection'));
    }

    await page.waitForSelector('input.checkout-store-chooser-input');
    await page.click('input.checkout-store-chooser-input');
    await page.$eval('input.checkout-store-chooser-input', (el) => (el.value = ''));
    await page.type('input.checkout-store-chooser-input', ZIP_CODE, { delay: 150 });

    log(chalk.magenta('Typed ZIP code'));
    await page.waitForSelector("input[name='pickup-store']");
    await page.click("input[name='pickup-store']", { delay: 1500 });
    log(chalk.magenta('Selected store'));
    await page.waitForSelector('[data-automation-id="save-label"]');
    await page.click('[data-automation-id="save-label"]', { delay: 1500 });
    log(chalk.magenta('Saved store'));

    await new Promise((resolve) => setTimeout(resolve, 10000));
    await page.close();
  }
}

const scrapePage = async (browser, pageUrl) => {
  const page = await browser.newPage();
  await page.authenticate({
    username,
    password,
  });
  log(chalk.cyan(`Going to page: ${pageUrl}`), chalk.italic(' Authenticated'));

  try {
    await page.goto(pageUrl, { timeout: 120000, waitUntil: 'networkidle0' });

    const pageResult = await page.evaluate(() => {
      let relevantItems = [];
      let allItems = [];
      const BYPASS_FILTERS = false;

      const addressDivs =
        document
          ?.querySelectorAll("[data-automation-id='fulfillment-address']")[1]
          ?.querySelectorAll('.f7') ?? [];

      const storeName = addressDivs[0]?.textContent ?? null;
      const storeAddress = addressDivs[1]?.textContent ?? null;

      const itemStack = document.querySelector("[data-testid='item-stack']");
      const itemElements = itemStack ? itemStack?.querySelectorAll('[data-item-id]') : [];
      const pageNotFound = document.body.textContent.includes('No se pudo encontrar esta página.');
      if (pageNotFound) {
        return { allItems, relevantItems, pageNotFound };
      }

      itemElements.forEach((item) => {
        const id = item.getAttribute('data-item-id');
        const link = item.querySelector('a')?.href ?? null;
        const imageSrc = item.querySelector('img')?.src;
        const productPriceContainer = item.querySelector("[data-automation-id='product-price']");

        let currentPrice = null;
        let originalPrice = null;
        let discount = null;
        let brand = null;
        let productName = null;
        let ending = null;

        if (productPriceContainer) {
          currentPrice = productPriceContainer.children[0]?.textContent ?? null;
          if (currentPrice) {
            ending = currentPrice.slice(-2);
            currentPrice = parseFloat(currentPrice.replace('$', '').replace(',', '')).toFixed(2);
          }

          originalPrice = productPriceContainer.children[2]?.textContent ?? null;
          if (originalPrice) {
            originalPrice = parseFloat(originalPrice.replace('$', '').replace(',', '')).toFixed(2);
          }

          discount = originalPrice
            ? (
                ((parseFloat(originalPrice) - parseFloat(currentPrice)) /
                  parseFloat(originalPrice)) *
                100
              ).toFixed(2)
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

        if (
          BYPASS_FILTERS ||
          ending === '01' ||
          ending === '02' ||
          ending === '03' ||
          discount > 40
        ) {
          relevantItems.push(parsedItem);
        }
      });

      return { allItems, relevantItems, pageNotFound };
    });

    log(chalk.green('Scraping finished for page'), pageUrl);

    await page.close();
    return pageResult;
  } catch (error) {
    await page.close();
    log(chalk.red('Error scraping page:'), error);
    throw error;
  }
};

app.post('/scrape', async (req, res) => {

  try {

    log(chalk.cyanBright('Starting scraping process'));
    const results = await scrapeAllUrls();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  log(chalk.green(`Server listening at http://localhost:${PORT}`));
});

export default app;
