// filepath: /home/yuiseki/src/github.com/yuiseki/hatebu-ai/scripts/histogram.ts
// { key[year] : value{ key[number_of_uploads] : value[number_of_days] } }
// input filePaths: ./data/year/month/day.json
// output filePath: ./data/histogram.json

import fs from "fs";
import path from "path";

const processAllFiles = async () => {
  // ヒストグラムデータを格納するオブジェクト
  // JSON化のためにMapではなく通常のオブジェクトを使用
  const histogram: Record<number, Record<number, number>> = {};

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
    const year = parseInt(yearStr);
    const yearPath = path.join(dataDir, yearStr);

    // 年ごとのヒストグラムを初期化
    histogram[year] = {};

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

          // ヒストグラムを更新
          if (!histogram[year][numberOfUploads]) {
            histogram[year][numberOfUploads] = 0;
          }
          histogram[year][numberOfUploads]++;
        } catch (error) {
          console.error(`Error processing ${filePath}:`, error);
        }
      }
    }
  }

  // 処理したファイル数を出力
  console.info("ヒストグラム作成完了");

  // ヒストグラムを保存
  const histogramFilePath = `./data/histogram.json`;
  fs.writeFileSync(histogramFilePath, JSON.stringify(histogram, null, 2));
  console.info(`保存しました: ${histogramFilePath}`);
};

(async () => {
  await processAllFiles();
})();
