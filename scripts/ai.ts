import { Ollama } from "@langchain/ollama";
import * as fs from "fs";
import * as path from "path";

interface BookmarkItem {
  title: string;
  link: string;
  date: string;
}

async function extractKeywords(bookmarks: BookmarkItem[], filePath: string): Promise<string[]> {
  const llm = new Ollama({
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.OLLAMA_CHAT_MODEL || "qwen3:1.7b",
    temperature: 0.3,
  });

  // ファイルパスから日付を抽出
  const pathParts = filePath.split(path.sep);
  const year = pathParts[pathParts.length - 3];
  const month = pathParts[pathParts.length - 2];
  const day = pathParts[pathParts.length - 1].replace('.json', '');
  const dateStr = `${year}年${month}月${day}日`;

  // ブックマークのタイトルをまとめて文字列に変換
  const titles = bookmarks.map(bookmark => bookmark.title).join('\n');

  const prompt = `以下は${dateStr}のはてなブックマークのタイトル一覧です。これらのタイトルから、Amazonアフィリエイトで商品を販売する際に効果的なキーワードを抽出してください。

タイトル一覧:
${titles}

要件:
- プログラミング、テクノロジー、開発ツール、書籍、学習リソースに関連するキーワードを優先
- 商品検索で使われそうな具体的なキーワード（技術名、プログラミング言語、ツール名、概念など）
- 5-15個程度のキーワード
- 日本語のキーワードも英語のキーワードも含める
- 重複を避ける

重要: 回答は必ず有効なJSON配列形式でお答えください。説明文は不要です。
出力例: ["Python", "機械学習", "Docker", "AWS", "React"]`;

  let response;
  try {
    response = await llm.invoke(prompt);
    
    // LLMの応答からJSONを抽出
    let jsonStr = response.toString();
    
    // より堅牢なJSON抽出ロジック
    // 1. ```json ブロックを探す
    let jsonMatch = jsonStr.match(/```json\s*(\[.*?\])\s*```/s);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // 2. [ から ] までの最初の配列を探す
      jsonMatch = jsonStr.match(/\[(?:[^[\]]+|\[[^\]]*\])*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        // 3. 行ごとに分析してJSON配列を探す
        const lines = jsonStr.split('\n');
        const jsonLines: string[] = [];
        let inArray = false;
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[')) {
            inArray = true;
            jsonLines.push(trimmed);
          } else if (inArray) {
            jsonLines.push(trimmed);
            if (trimmed.endsWith(']')) {
              break;
            }
          }
        }
        
        if (jsonLines.length > 0) {
          jsonStr = jsonLines.join('\n');
        }
      }
    }
    
    // 不正な文字を除去
    jsonStr = jsonStr.replace(/```json|```|^[^[\]]*(?=\[)/g, '').trim();
    
    // JSONをパース
    const keywords = JSON.parse(jsonStr);
    
    if (Array.isArray(keywords)) {
      // 文字列の配列であることを確認
      const stringKeywords = keywords.filter(k => typeof k === 'string');
      return stringKeywords;
    } else {
      console.error("Expected array but got:", keywords);
      return [];
    }
  } catch (error) {
    console.error("Error extracting keywords:", error);
    if (response) {
      console.error("Raw response:", response.toString().substring(0, 500) + "...");
    }
    
    // フォールバックとして基本的なキーワード抽出
    const fallbackKeywords = extractFallbackKeywords(bookmarks);
    return fallbackKeywords;
  }
}

function extractFallbackKeywords(bookmarks: BookmarkItem[]): string[] {
  const keywordSet = new Set<string>();
  const techKeywords = [
    "GitHub", "Python", "JavaScript", "TypeScript", "React", "Vue", "Angular",
    "Docker", "Kubernetes", "AWS", "Azure", "GCP", "AI", "機械学習", "LLM",
    "API", "データベース", "SQL", "NoSQL", "Web開発", "モバイル開発",
    "DevOps", "CI/CD", "クラウド", "セキュリティ", "ブロックチェーン",
    "マイクロサービス", "コンテナ", "サーバーレス", "GraphQL", "REST",
    "フロントエンド", "バックエンド", "フルスタック", "プログラミング"
  ];

  bookmarks.forEach(bookmark => {
    const title = bookmark.title.toLowerCase();
    techKeywords.forEach(keyword => {
      if (title.includes(keyword.toLowerCase())) {
        keywordSet.add(keyword);
      }
    });
  });

  return Array.from(keywordSet).slice(0, 15);
}

function findJsonFilesNeedingAi(): string[] {
  const dataDir = path.join(process.cwd(), "public/data");
  const filesToProcess: string[] = [];

  try {
    // 年ディレクトリを探索（2025年以降）
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
        
        // 日のJSONファイルを探索
        const files = fs.readdirSync(monthDir)
          .filter(file => /^(0[1-9]|[12]\d|3[01])\.json$/.test(file))
          .sort();

        for (const file of files) {
          const jsonPath = path.join(monthDir, file);
          const aiJsonPath = path.join(monthDir, file.replace('.json', '.ai.json'));
          
          // .jsonファイルが存在して、.ai.jsonファイルが存在しない場合
          if (fs.existsSync(jsonPath) && !fs.existsSync(aiJsonPath)) {
            filesToProcess.push(jsonPath);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error scanning for files:", error);
  }

  return filesToProcess;
}

async function processFile(inputPath: string): Promise<void> {
  const outputPath = inputPath.replace('.json', '.ai.json');
  
  try {
    console.log(`Processing: ${inputPath}`);
    
    // 入力ファイルを読み込み
    const inputData = fs.readFileSync(inputPath, "utf-8");
    const bookmarks: BookmarkItem[] = JSON.parse(inputData);

    if (bookmarks.length === 0) {
      console.log(`  No bookmarks found, skipping.`);
      return;
    }

    console.log(`  Found ${bookmarks.length} bookmarks`);

    // キーワードを抽出
    const keywords = await extractKeywords(bookmarks, inputPath);

    console.log(`  Extracted ${keywords.length} keywords:`, keywords);

    // 結果をファイルに保存
    fs.writeFileSync(outputPath, JSON.stringify(keywords, null, 2), "utf-8");

    console.log(`  Keywords saved to: ${outputPath}`);
  } catch (error) {
    console.error(`Error processing ${inputPath}:`, error);
  }
}

async function main() {
  console.log("Scanning for JSON files that need AI processing...");
  
  const filesToProcess = findJsonFilesNeedingAi();
  
  if (filesToProcess.length === 0) {
    console.log("No files need processing.");
    return;
  }

  console.log(`Found ${filesToProcess.length} files to process:`);
  filesToProcess.forEach(file => console.log(`  ${file}`));
  console.log();

  // 各ファイルを順次処理
  for (const filePath of filesToProcess) {
    await processFile(filePath);
    console.log(); // 空行で区切り
  }

  console.log("All files processed successfully!");
}

// スクリプトが直接実行された場合のみmainを実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}