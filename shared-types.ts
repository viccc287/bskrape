export interface Result {
    id: string | null;
    imageSrc: string | null;
    link: string | null;
    currentPrice: number | null;
    originalPrice: number | null;
    discount: number | null;
    ending: string | null;
    brand: string | null;
    productName: string | null;
    storeName: string | null;
    storeAddress: string | null;
  }
  
  export interface ScrapedData {
    json: Result[];
    csv: string;
}
  
export interface Category{
  name: string;
  url: string;
}

export interface APIScrapeResponse {
  success: boolean;
  scrapedData?: ScrapedData;
}