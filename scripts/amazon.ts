import * as fs from "fs";
import * as path from "path";
import * as ProductAdvertisingAPIv1 from "amazon-pa-api5-node-ts";
import { config } from "dotenv";

// .envファイルから環境変数を読み込み
config();

interface AmazonProduct {
  asin?: string;
  title?: string;
  imageUrl?: string;
  price?: string;
  priceValue?: number;
  detailPageUrl?: string;
  author?: string;
  brand?: string;
}

interface AmazonSearchResult {
  keyword: string;
  products: AmazonProduct[];
  searchedAt: string;
}

// 環境変数から認証情報を取得
const ACCESS_KEY = process.env.PA_API_ACCESS_KEY;
const SECRET_KEY = process.env.PA_API_SECRET_KEY;
const PARTNER_TAG = process.env.PA_API_PARTNER_TAG;

// 環境変数チェック
function validateEnvironment(): boolean {
  console.log("Checking environment variables...");
  console.log("ACCESS_KEY:", ACCESS_KEY ? "Set" : "Not set");
  console.log("SECRET_KEY:", SECRET_KEY ? "Set" : "Not set");
  console.log("PARTNER_TAG:", PARTNER_TAG ? "Set" : "Not set");
  
  if (!ACCESS_KEY || !SECRET_KEY || !PARTNER_TAG) {
    console.error("ERROR: 必要な環境変数が設定されていません。");
    console.error("PA_API_ACCESS_KEY, PA_API_SECRET_KEY, PA_API_PARTNER_TAG");
    return false;
  }
  return true;
}

// API クライアント初期化
function initializeApiClient(): ProductAdvertisingAPIv1.DefaultApi | null {
  if (!validateEnvironment()) {
    return null;
  }

  const defaultClient = ProductAdvertisingAPIv1.ApiClient.instance;
  defaultClient.accessKey = ACCESS_KEY!;
  defaultClient.secretKey = SECRET_KEY!;
  defaultClient.host = "webservices.amazon.co.jp";
  defaultClient.region = "us-west-2";

  return new ProductAdvertisingAPIv1.DefaultApi();
}

// ファイル名に使える文字列に変換（現在は未使用だが将来の拡張用）
// function sanitizeFilename(s: string): string {
//   return s.replace(/[^\w-]/g, "_");
// }

// Amazon商品検索
async function searchAmazonProducts(
  api: ProductAdvertisingAPIv1.DefaultApi,
  keyword: string,
  itemCount: number = 5
): Promise<AmazonProduct[]> {
  const req = new ProductAdvertisingAPIv1.SearchItemsRequest();
  req.PartnerTag = PARTNER_TAG!;
  req.PartnerType = "Associates";
  req.Keywords = keyword;
  req.SearchIndex = "All";
  req.ItemCount = itemCount;
  req.Resources = [
    "ItemInfo.Title",
    "Images.Primary.Medium",
    "Offers.Listings.Price",
    "ItemInfo.ByLineInfo",
    "ItemInfo.ManufactureInfo",
  ];

  try {
    const data = await api.searchItems(req);
    const products: AmazonProduct[] = [];

    if (data.SearchResult?.Items) {
      for (const item of data.SearchResult.Items) {
        const product: AmazonProduct = {
          asin: item.ASIN,
          title: item.ItemInfo?.Title?.DisplayValue,
          imageUrl: item.Images?.Primary?.Medium?.URL,
          detailPageUrl: item.DetailPageURL,
          author: item.ItemInfo?.ByLineInfo?.Contributors?.[0]?.Name,
          brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ||
                 item.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue,
        };

        // 価格情報の取得
        if (item.Offers?.Listings?.[0]?.Price) {
          const priceInfo = item.Offers.Listings[0].Price;
          product.price = priceInfo.DisplayAmount;
          product.priceValue = priceInfo.Amount;
        }

        products.push(product);
      }
    }

    return products;
  } catch (error: unknown) {
    console.error(`❌ キーワード "${keyword}" でエラー発生:`, error instanceof Error ? error.message : error);
    return [];
  }
}

// 単一ファイルの処理
async function processFile(inputPath: string): Promise<void> {
  const outputPath = inputPath.replace(".ai.json", ".amazon.json");

  // 既に出力ファイルが存在する場合はスキップ
  if (fs.existsSync(outputPath)) {
    console.log(`Skipping ${inputPath} - Amazon data already exists`);
    return;
  }

  try {
    // キーワードファイルを読み込み
    const keywords: string[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

    if (!Array.isArray(keywords) || keywords.length === 0) {
      console.log(`No keywords found in ${inputPath}`);
      return;
    }

    console.log(`Processing: ${inputPath}`);
    console.log(`  Found ${keywords.length} keywords:`, keywords.slice(0, 5).join(", ") + 
                (keywords.length > 5 ? "..." : ""));

    const api = initializeApiClient();
    if (!api) {
      console.error("Failed to initialize Amazon API client");
      return;
    }

    const results: AmazonSearchResult[] = [];

    // 各キーワードで商品検索（最大5つのキーワードに制限）
    const limitedKeywords = keywords.slice(0, 5);
    for (const keyword of limitedKeywords) {
      console.log(`  Searching Amazon for: ${keyword}`);
      
      const products = await searchAmazonProducts(api, keyword, 3);
      
      results.push({
        keyword,
        products,
        searchedAt: new Date().toISOString(),
      });

      console.log(`    Found ${products.length} products`);

      // APIレート制御：1回/秒以下を維持
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    // 結果をファイルに保存
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");

    const totalProducts = results.reduce((sum, result) => sum + result.products.length, 0);
    console.log(`  Amazon data saved to: ${outputPath}`);
    console.log(`  Total products found: ${totalProducts}`);

  } catch (error) {
    console.error(`Error processing ${inputPath}:`, error);
  }
}

// 2025年6月以降の.ai.jsonファイルで.amazon.jsonがないものを検索
function findAiFilesNeedingAmazon(): string[] {
  const filesToProcess: string[] = [];
  const dataDir = path.join(process.cwd(), "public/data");

  try {
    // 年ディレクトリを探索
    const years = fs.readdirSync(dataDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .filter(year => /^\d{4}$/.test(year) && parseInt(year) >= 2025)
      .sort();

    for (const year of years) {
      const yearDir = path.join(dataDir, year);
      
      // 月ディレクトリを探索
      const months = fs.readdirSync(yearDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(month => {
          if (!/^(0[1-9]|1[0-2])$/.test(month)) return false;
          
          // 2025年の場合は6月以降のみ処理
          if (parseInt(year) === 2025) {
            return parseInt(month) >= 6;
          }
          
          return true;
        })
        .sort();

      for (const month of months) {
        const monthDir = path.join(yearDir, month);
        
        // .ai.jsonファイルを探索
        const files = fs.readdirSync(monthDir)
          .filter(file => /^(0[1-9]|[12]\d|3[01])\.ai\.json$/.test(file))
          .sort();

        for (const file of files) {
          const aiJsonPath = path.join(monthDir, file);
          const amazonJsonPath = path.join(monthDir, file.replace('.ai.json', '.amazon.json'));
          
          // .ai.jsonファイルが存在して、.amazon.jsonファイルが存在しない場合
          if (fs.existsSync(aiJsonPath) && !fs.existsSync(amazonJsonPath)) {
            filesToProcess.push(aiJsonPath);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error scanning for AI files:", error);
  }

  return filesToProcess;
}

async function main() {
  console.log("Scanning for AI files that need Amazon product data...");
  
  if (!validateEnvironment()) {
    process.exit(1);
  }

  const filesToProcess = findAiFilesNeedingAmazon();
  
  if (filesToProcess.length === 0) {
    console.log("No AI files need Amazon product data processing.");
    return;
  }

  console.log(`Found ${filesToProcess.length} files to process`);

  for (const filePath of filesToProcess) {
    await processFile(filePath);
  }

  console.log("Amazon product data processing completed!");
}

// スクリプトが直接実行された場合のみmainを実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
