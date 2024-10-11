import './style.css';
import { Result, ScrapedData, Category, APIScrapeResponse } from '../shared-types';

let skrapeButton = document.querySelector('#skrape') as HTMLButtonElement;
let categoryButton = document.querySelector('#category-button') as HTMLButtonElement;
let logsContainer = document.querySelector('#logs') as HTMLElement;
let hideLogsButton = document.querySelector('#hide-logs') as HTMLButtonElement;
let clearLogsButton = document.querySelector('#clear-logs') as HTMLButtonElement;
let zipCodeInput = document.querySelector('#zipcode-input') as HTMLInputElement;
let categoriesContainer = document.querySelector('#categories') as HTMLDivElement;
let resultsList = document.getElementById('results-list') as HTMLUListElement;
let serverSelect = document.querySelector('#server-select') as HTMLSelectElement;

skrapeButton.disabled = true;
categoryButton.disabled = true;
serverSelect.disabled = true;
let canFetchCategories = false;
let canFetchData = false;


let eventSource: EventSource | null = null;
let clientRequestId: string | null = null;
let availableServers = [];
let selectedServerURL: string | null = null;
let selectedCategoryURLs: string[] = [];

console.log(
  "\r\n              _                         \r\n__      _____| | ___ __ __ _ _ __   ___ \r\n\\ \\ /\\ / / __| |/ / '__/ _` | '_ \\ / _ \\\r\n \\ V  V /\\__ \\   <| | | (_| | |_) |  __/\r\n  \\_/\\_/ |___/_|\\_\\_|  \\__,_| .__/ \\___|\r\n                            |_|         \r\n",
);
log(
  "\r\n              _                         \r\n__      _____| | ___ __ __ _ _ __   ___ \r\n\\ \\ /\\ / / __| |/ / '__/ _` | '_ \\ / _ \\\r\n \\ V  V /\\__ \\   <| | | (_| | |_) |  __/\r\n  \\_/\\_/ |___/_|\\_\\_|  \\__,_| .__/ \\___|\r\n                            |_|         \r\n",
);

if (localStorage.getItem('categories')) {
  log('Categories loaded from local storage', 'yellow');
  displayCategories(JSON.parse(localStorage.getItem('categories') as string));
} else {
  log('No categories loaded from local storage, click on Fetch categories!', 'yellow');
}

const SERVER_CONFIG: {
  [key: string]: {
    url: string;
    name: string;
    description: string;
  };
} = {
  cloud: {
    url: 'https://skrapper.onrender.com',
    name: 'Cloud',
    description: 'Cloud (slow, but mostly active)',
  },
  dedicated: {
    url: 'http://example.com',
    name: 'Dedicated',
    description: 'Dedicated (fast, but not always active)',
  },
  local: {
    url: 'http://localhost:4000',
    name: 'Local',
    description: 'Local (fastest, but requires you to run a server locally on port 4000)',
  },
};

for (const i in SERVER_CONFIG) {
  try {
    log(`Checking ${SERVER_CONFIG[i].name} server status...`, 'gray');

    const response = await fetch(`${SERVER_CONFIG[i].url}/ping`, {
      method: 'GET',
      signal: AbortSignal.timeout(20000),
    });

    if (response.ok) {
      log(`${SERVER_CONFIG[i].name} server is active`, 'green');
      availableServers.push(SERVER_CONFIG[i]);
    } else {
      log(`${SERVER_CONFIG[i].name} server is inactive`, 'red');
    }
  } catch (error) {
    if (error instanceof Error)
      log(`${SERVER_CONFIG[i].name} server is inactive: ${error.message}`, 'red');
    else log(`${SERVER_CONFIG[i].name} server is inactive`, 'red');
  }
}

if (availableServers.length === 0) {
  log('No servers available. Please reload or try again later', 'darkred');
  skrapeButton.disabled = true;
  categoryButton.disabled = true;
  serverSelect.disabled = true;
  serverSelect.style.color = 'red';
  canFetchCategories = false;
  canFetchData = false;
  const noServerOption = document.getElementById('no-server-option') as HTMLOptionElement;
  noServerOption.textContent = 'No servers available';
} else {
  for (const server of availableServers) {
    const option = document.createElement('option');
    option.value = server.url;
    option.textContent = server.description;
    serverSelect.appendChild(option);
  }
  canFetchCategories = true;
  canFetchData = true;
  skrapeButton.disabled = false;
  categoryButton.disabled = false;
  serverSelect.disabled = false;
}

serverSelect.addEventListener('change', () => {
  selectedServerURL = serverSelect.value;
  if (eventSource) {
    eventSource.close();
  }
  eventSource = new EventSource(`${selectedServerURL}/logs`);
  eventSource.onmessage = (event) => {
    const { message, requestId } = JSON.parse(event.data);
    if (requestId) clientRequestId = requestId;
    const coloredHtml = ansiToHtml(message);
    logsContainer.innerHTML += coloredHtml + '<br>';
    console.log(message);
    scrollLogsToBottom();
  };
  log(`Selected server changed`, 'yellow');
});

const loadingSpinner = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="24" height="24">
  <g>
    <path fill="#178a1b" d="M25,5A20.14,20.14,0,0,1,45,22.88a2.51,2.51,0,0,0,2.49,2.26h0A2.52,2.52,0,0,0,50,22.33a25.14,25.14,0,0,0-50,0,2.52,2.52,0,0,0,2.5,2.81h0A2.51,2.51,0,0,0,5,22.88,20.14,20.14,0,0,1,25,5Z">
      <animateTransform 
        attributeName="transform" 
        type="rotate" 
        from="0 25 25"
        to="360 25 25" 
        dur="0.8s" 
        repeatCount="indefinite"/>
    </path>
  </g>
</svg>
`;

interface AnsiColorCodes {
  [key: number]: string;
}

const ansiColorCodes: AnsiColorCodes = {
  30: 'color: black;',
  31: 'color: red;',
  32: 'color: green;',
  33: 'color: yellow;',
  34: 'color: rgb(51, 102, 255);',
  35: 'color: magenta;',
  36: 'color: cyan;',
  37: 'color: white;',
  90: 'color: gray;',
  91: 'color: lightred;',
  92: 'color: lightgreen;',
  93: 'color: lightyellow;',
  94: 'color: lightblue;',
  95: 'color: lightmagenta;',
  96: 'color: lightcyan;',
  97: 'color: white;',
  40: 'background-color: black;',
  41: 'background-color: red;',
  42: 'background-color: green;',
  43: 'background-color: yellow;',
  44: 'background-color: blue;',
  45: 'background-color: magenta;',
  46: 'background-color: cyan;',
  47: 'background-color: white;',
};

const ansiToHtml = (text: string): string => {
  const ansiRegex = /\u001b\[(\d+)m/g;
  let result = '<span>';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(text)) !== null) {
    const colorCode = parseInt(match[1], 10);
    const style = ansiColorCodes[colorCode] || '';

    result += text.slice(lastIndex, match.index);
    result += `</span><span style="${style}">`;
    lastIndex = ansiRegex.lastIndex;
  }

  result += text.slice(lastIndex) + '</span>';
  return result;
};

function toggleLogs() {
  logsContainer.classList.toggle('hidden');

  if (logsContainer.classList.contains('hidden')) {
    hideLogsButton.textContent = 'Show logs';
    document.body.classList.add('logs-hidden');
  } else {
    hideLogsButton.textContent = 'Hide logs';
    document.body.classList.remove('logs-hidden');
  }
}

function clearLogs() {
  logsContainer.innerHTML = '';
}

function scrollLogsToBottom() {
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

hideLogsButton.addEventListener('click', toggleLogs);
clearLogsButton.addEventListener('click', clearLogs);

window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
});

function log(message: string, color: string = 'white') {
  logsContainer.innerHTML += `<span style="color: ${color}">${message}</span><br>`;
  scrollLogsToBottom();
}

skrapeButton.addEventListener('click', (event) => {
  event.preventDefault();
  startScraping();
});

categoryButton.addEventListener('click', (event) => {
  event.preventDefault();
  getCategories();
});

let loadingTimer: NodeJS.Timeout;

function startTimer() {
  let time = 0;
  loadingTimer = setInterval(() => {
    time++;
    skrapeButton.textContent = formatTime(time);
  }, 1000);
}

function stopTimer() {
  clearInterval(loadingTimer);
}

function formatTime(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
}

function getCategories(): void {
  if (!selectedServerURL) {
    log('Please select a server!', 'red');
    return;
  }
  if (!canFetchCategories) {
    return;
  }
  if (
    zipCodeInput.value.length !== 0 &&
    (zipCodeInput.value.match(/\D/) || zipCodeInput.value.length !== 5)
  ) {
    log('Please enter a valid 5-digit zip code', 'red');
    return;
  }

  categoryButton.innerHTML = loadingSpinner;
  categoryButton.disabled = true;
  canFetchCategories = false;

  fetch(`${selectedServerURL}/get-categories/${clientRequestId}?z=${zipCodeInput.value}`)
    .then((response) => response.json())
    .then((data: Category[]) => {
      if (data.length === 0) {
        log('No categories found, or an error ocurred', 'red');
        return;
      }
      localStorage.setItem('categories', JSON.stringify(data));
      log('Categories fetched successfully', 'green');
      displayCategories(data);
    })
    .catch((error) => {
      console.error('Error fetching categories:', error);
    })
    .finally(() => {
      categoryButton.innerHTML = 'Fetch categories';
      categoryButton.disabled = false;
      canFetchCategories = true;
    });
}

function displayCategories(categories: Category[]): void {
  categoriesContainer.innerHTML = `
    <div id="categories-form">
      <input type="text" id="search-input" placeholder="Search categories to skrape" />
      <div id='categories-info'>
        <button type="button" id="toggle-all-btn">Select all</button>
        <button type="button" id="clear-selection-btn">Clear selection</button>
        <span id='selected-badge'>
        <p id="selected-count">0 selected</p>
        </span>
        
      </div>
      <ul id="categories-list"></ul>
    </div>
  `;
  const toggleAllButton = document.getElementById('toggle-all-btn') as HTMLButtonElement;
  const clearSelectionButton = document.getElementById('clear-selection-btn') as HTMLButtonElement;
  const categoriesList = document.getElementById('categories-list') as HTMLUListElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const selectedCountElement = document.getElementById('selected-count') as HTMLParagraphElement;

  function updateSelectedCount() {
    selectedCountElement.textContent = `${selectedCategoryURLs.length} selected`;
  }

  function renderCategories(filteredCategories: Category[]) {
    categoriesList.innerHTML = '';

    filteredCategories.forEach((category) => {
      const label = document.createElement('label');
      const isChecked = selectedCategoryURLs.includes(category.url);
      label.innerHTML = `
        <input type="checkbox" value="${category.url}" class="category-checkbox" ${isChecked ? 'checked' : ''} />
        <span>${category.name}</span>
      `;
      categoriesList.appendChild(label);
    });

    const checkboxes = document.querySelectorAll(
      '.category-checkbox',
    ) as NodeListOf<HTMLInputElement>;

    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        if (target.checked) {
          if (!selectedCategoryURLs.includes(target.value)) {
            selectedCategoryURLs.push(target.value);
          }
        } else {
          selectedCategoryURLs = selectedCategoryURLs.filter((url) => url !== target.value);
        }
        updateToggleAllButton();
        updateSelectedCount();
      });
    });

    updateToggleAllButton();
    updateSelectedCount();
  }

  function updateToggleAllButton() {
    const checkboxes = document.querySelectorAll(
      '.category-checkbox',
    ) as NodeListOf<HTMLInputElement>;
    const allChecked = Array.from(checkboxes).every((checkbox) => checkbox.checked);
    toggleAllButton.innerHTML = allChecked ? 'Unselect all' : `Select all ${checkboxes.length}`;
  }

  function clearSelection() {
    selectedCategoryURLs = [];
    const checkboxes = document.querySelectorAll(
      '.category-checkbox',
    ) as NodeListOf<HTMLInputElement>;
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    updateToggleAllButton();
    updateSelectedCount();
  }

  renderCategories(categories);

  searchInput.addEventListener('input', () => {
    const searchValue = searchInput.value.toLowerCase();
    const filteredCategories = categories.filter((category) =>
      category.name.toLowerCase().includes(searchValue),
    );

    renderCategories(filteredCategories);
  });

  toggleAllButton.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll(
      '.category-checkbox',
    ) as NodeListOf<HTMLInputElement>;

    const allChecked = Array.from(checkboxes).every((checkbox) => checkbox.checked);

    checkboxes.forEach((checkbox) => {
      checkbox.checked = !allChecked;
      const value = checkbox.value;

      if (!allChecked && !selectedCategoryURLs.includes(value)) {
        selectedCategoryURLs.push(value);
      } else if (allChecked && selectedCategoryURLs.includes(value)) {
        selectedCategoryURLs = selectedCategoryURLs.filter((url) => url !== value);
      }
    });

    updateToggleAllButton();
    updateSelectedCount();
  });

  clearSelectionButton.addEventListener('click', clearSelection);
}

async function startScraping(): Promise<void> {
  if (!selectedServerURL) {
    log('Please select a server!', 'red');
    return;
  }

  if (selectedCategoryURLs.length === 0) {
    log('Please select at least one category', 'red');
    return;
  }

  if (
    zipCodeInput.value.length !== 0 &&
    (zipCodeInput.value.match(/\D/) || zipCodeInput.value.length !== 5)
  ) {
    log('Please enter a valid 5-digit zip code', 'red');
    return;
  }

  if (!canFetchData) {
    return;
  }

  startTimer();
  skrapeButton.disabled = true;
  canFetchData = false;
  const zipCode = parseInt(zipCodeInput.value);

  try {
    resultsList.innerHTML = loadingSpinner;
    const response = await fetch(`${selectedServerURL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls: selectedCategoryURLs, requestId: clientRequestId, zipCode }),
    });

    const responseJson: APIScrapeResponse = await response.json();

    if (responseJson.success) {
      if (responseJson.scrapedData) {
        displayResults(responseJson.scrapedData.json);
        addDownloadButtons(responseJson.scrapedData);
      } else {
        log('No scraped data available', 'red');
        resultsList.innerHTML = '';
      }
    } else {
      log(
        'Error during scraping. Please try again. If the issue persists, try with another zipcode',
        'red',
      );
      resultsList.innerHTML = '';
      return;
    }
  } catch (error) {
    console.error('Error starting scraping:', error);
    log(
      'Error during scraping. Please try again. If the issue persists, try with another zipcode',
      'red',
    );
    resultsList.innerHTML = '';
  } finally {
    stopTimer();
    skrapeButton.innerHTML = 'SKRAPE';
    skrapeButton.disabled = false;
    canFetchData = true;
  }
}

function displayResults(results: Result[]): void {
  if (results.length === 0) {
    log(
      'No relevant results or sales for the selected categories... But you can download the full CSV',
      'cyan',
    );
    resultsList.innerHTML = '';
    return;
  }

  results.sort((a, b) => {
    if (a.currentPrice && b.currentPrice) {
      return a.currentPrice - b.currentPrice;
    }
    return 0;
  });

  function formatNumber(number: number | null): string {
    if (!number) {
      return '';
    }
    return number.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  resultsList.innerHTML = '';

  results.forEach((result: Result) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.innerHTML = `
      <a href=${result.link}>
        <div class="product-image-container">
          <img src="${result.imageSrc || 'default-image.jpg'}" alt="${result.productName}" class="product-image">
        </div>
        <div class="product-info">
          <h4 class="brand">${result.brand}</h4>
          <p class="product-name">${result.productName}</p>
          <p class="store-name">${result.storeName}</p>
          <p class="id">${result.id}</p>
          <div class="pricing">
            ${result.currentPrice ? `<span class="price">$${formatNumber(result.currentPrice)}</span>` : ''}
            ${result.originalPrice ? `<span class="original-price">$${formatNumber(result.originalPrice)}</span>` : ''}
            ${result.discount ? `<span class="discount">-${formatNumber(result.discount)}%</span>` : ''}
          </div>
          ${
            result.ending
              ? `<span class="ending ${result.ending === '01' ? 'ultima' : result.ending === '02' ? 'segunda' : result.ending === '03' ? 'primera' : ''}">
                    ${result.ending === '01' ? 'Última liquidación' : result.ending === '02' ? 'Segunda liquidación' : result.ending === '03' ? 'Primera liquidación' : ''}
                 </span>`
              : ''
          }
        </div>
      </a>
    `;
    resultsList.appendChild(li);
  });
}

function addDownloadButtons(data: ScrapedData): void {
  const buttonSection = document.querySelector('#button-section') as HTMLElement;

  const downloadCsvButtonExists = document.getElementById('download-csv');
  if (downloadCsvButtonExists) downloadCsvButtonExists.remove();

  const downloadJsonButtonExists = document.getElementById('download-json');
  if (downloadJsonButtonExists) downloadJsonButtonExists.remove();

  const downloadCsvButton = document.createElement('button');
  downloadCsvButton.id = 'download-csv';
  downloadCsvButton.className = 'download-button';
  downloadCsvButton.textContent = 'Download full CSV';
  buttonSection.appendChild(downloadCsvButton);

  if (data.json.length !== 0) {
    const downloadJsonButton = document.createElement('button');
    downloadJsonButton.id = 'download-json';
    downloadJsonButton.className = 'download-button';
    downloadJsonButton.textContent = 'Download relevant JSON';
    buttonSection.appendChild(downloadJsonButton);

    document.getElementById('download-json')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data.json, null, 2)], { type: 'application/json' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scraped_data.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  document.getElementById('download-csv')?.addEventListener('click', () => {
    const blob = new Blob([data.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scraped_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}
