// input filePaths: ./data/year/month/day.json
// output filePaths:
// - ./data/histogram.json (元の形式): { key[year] : value{ key[number_of_uploads] : value[number_of_days] } }
// - ./data/histogram_array.json (新形式): { key[year] : value[ [number_of_uploads, number_of_days], ... ] }

import fs from "fs";
import path from "path";

const processAllFiles = async () => {
  // 元の形式のヒストグラムデータを格納するオブジェクト
  const histogram: Record<string, Record<number, number>> = {};

  // 新しい配列形式のヒストグラムデータを格納するオブジェクト
  const histogramArray: Record<string, Array<[number, number]>> = {};

  // データディレクトリを走査
  const dataDir = "./data";
  const years = fs
    .readdirSync(dataDir)
    .filter(
      (file) =>
        fs.statSync(path.join(dataDir, file)).isDirectory() &&
        /^\d{4}$/.test(file)
    );

  for (const yearStr of years) {
    const yearPath = path.join(dataDir, yearStr);

    // 年ごとのヒストグラムを初期化
    histogram[yearStr] = {};
    histogramArray[yearStr] = [];

    // 月ディレクトリを取得
    const months = fs
      .readdirSync(yearPath)
      .filter(
        (file) =>
          fs.statSync(path.join(yearPath, file)).isDirectory() &&
          /^\d{2}$/.test(file)
      );

    for (const monthStr of months) {
      const monthPath = path.join(yearPath, monthStr);

      // 日のJSONファイルを取得
      const days = fs
        .readdirSync(monthPath)
        .filter((file) => file.endsWith(".json") && /^\d{2}\.json$/.test(file));

      for (const dayFile of days) {
        const filePath = path.join(monthPath, dayFile);
        try {
          const data = fs.readFileSync(filePath, "utf-8");
          const infoList = JSON.parse(data);
          const numberOfUploads = infoList.length;

          // 元のヒストグラムを更新
          if (!histogram[yearStr][numberOfUploads]) {
            histogram[yearStr][numberOfUploads] = 0;
          }
          histogram[yearStr][numberOfUploads]++;
        } catch (error) {
          console.error(`Error processing ${filePath}:`, error);
        }
      }
    }

    // 元のヒストグラムから配列形式に変換
    for (const [uploads, days] of Object.entries(histogram[yearStr])) {
      histogramArray[yearStr].push([parseInt(uploads), days]);
    }

    // 配列形式をアップロード数でソート
    histogramArray[yearStr].sort((a, b) => a[0] - b[0]);
  }

  // 処理したファイル数を出力
  console.info("ヒストグラム作成完了");

  // 元の形式のヒストグラムを保存
  const histogramFilePath = `./data/histogram.json`;
  fs.writeFileSync(histogramFilePath, JSON.stringify(histogram, null, 2));
  console.info(`保存しました: ${histogramFilePath}`);

  // 配列形式のヒストグラムを保存
  const histogramArrayFilePath = `./data/histogram_array.json`;
  fs.writeFileSync(
    histogramArrayFilePath,
    JSON.stringify(histogramArray, null, 2)
  );
  console.info(`保存しました: ${histogramArrayFilePath}`);
};

(async () => {
  await processAllFiles();
})();
