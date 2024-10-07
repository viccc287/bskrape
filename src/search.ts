import './style.css';

let form = document.querySelector('form') as HTMLFormElement;
let button = document.querySelector('button') as HTMLButtonElement;
let app = document.querySelector('#app') as HTMLElement;

interface ScrapeResponse {
  success: boolean;
  results: Result[];
}

interface Result {
  id: string;
  imageSrc: string;
  link: string;
  currentPrice: number | null;
  originalPrice: number | null;
  discount: number | null;
  ending: string | null;
  brand: string;
  productName: string;
  storeName: string;
  storeAddress: string;
}

const SERVER_URL = 'http://localhost:3000/scrape';

form.addEventListener('submit', (event) => {
  event.preventDefault();
  getItemsFromUrl();
});

async function getItemsFromUrl(): Promise<void> {
  button.textContent = 'Loading...';
  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data: ScrapeResponse = await response.json();
    button.textContent = 'BUSCAR';

    if (data.success) {
      if (data.results.length === 0) {
        app.innerHTML = '<p>No hay resultados para esta categoría.</p>';
        return;
      }

      app.innerHTML = '<ul id="results-list"></ul>';
      const resultsList = document.getElementById('results-list') as HTMLUListElement;

      data.results.sort((a, b) => {
        if (a.currentPrice && b.currentPrice) {
          return a.currentPrice - b.currentPrice;
        }
        return 0;
      });

      data.results.forEach((result: Result) => {
        const li = document.createElement('li');
        li.className = 'result-item';
        li.innerHTML = `
          <a href="#">
            <div class="product-image-container">
              <img src="${result.imageSrc || 'default-image.jpg'}" alt="${result.productName}" class="product-image">
            </div>
            <div class="product-info">
              <h4 class="brand">${result.brand}</h4>
              <p class="product-name">${result.productName}</p>
              <p class="store-name">${result.storeName}</p>
              <div class="pricing">
                ${result.currentPrice ? `<span class="price">$${result.currentPrice}</span>` : ''}
                ${result.originalPrice ? `<span class="original-price">$${result.originalPrice}</span>` : ''}
                ${result.discount ? `<span class="discount">-${result.discount}%</span>` : ''}
              </div>
              ${
                result.ending
                  ? `<span class="ending ${result.ending === '01' ? 'ultima' : result.ending === '02' ? 'segunda' : 'primera'}">
                        ${result.ending === '01' ? 'Última liquidación' : result.ending === '02' ? 'Segunda liquidación' : 'Primera liquidación'}
                     </span>`
                  : ''
              }
            </div>
          </a>
        `;
        resultsList.appendChild(li);
        
      });
    } else {
      app.innerHTML = '<p>Error fetching data. Please try again.</p>';
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    app.innerHTML = '<p>Error fetching data. Please try again.</p>';
  }
}
