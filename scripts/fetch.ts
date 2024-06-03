import Parser from "rss-parser";
import fs from "fs";

const saveInfoListOfDateOfFeed = async (
  year: number,
  month: number,
  day: number
) => {
  const yearStr = year.toString();
  const monthStr = month.toString().padStart(2, "0");
  const dayStr = day.toString().padStart(2, "0");

  // create directory if not exists
  const dirPath = `./data/${yearStr}/${monthStr}`;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // save path is ./data/${year}/${month}/${day}.json
  const filePath = `${dirPath}/${dayStr}.json`;

  // if file exists, skip
  if (fs.existsSync(filePath)) {
    console.info(`Already exists: ${filePath}`);
    return;
  }

  const dateStr = `${yearStr}${monthStr}${dayStr}`;
  // fetch feed
  const feedUrl = `https://b.hatena.ne.jp/yuiseki/bookmark.rss?date=${dateStr}`;
  console.info(`Fetching: ${feedUrl}`);
  const parser = new Parser();
  const feed = await parser.parseURL(feedUrl);
  console.info(`Fetched: ${feedUrl}`);

  // extract info
  const infoList: Array<{
    title: string;
    link: string;
    date: string;
  }> = [];

  feed.items.forEach((item) => {
    if (
      item.title === undefined ||
      item.link === undefined ||
      item.isoDate === undefined
    ) {
      return;
    }
    const info = {
      title: item.title,
      link: item.link,
      date: item.isoDate,
    };
    infoList.push(info);
  });

  fs.writeFileSync(filePath, JSON.stringify(infoList, null, 2));
  console.info(`Saved: ${filePath}`);
  // sleep 0.5 sec
  await new Promise((resolve) => setTimeout(resolve, 500));
};

(async () => {
  // iterate over many dates
  for (let i = 1; i < 100; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    await saveInfoListOfDateOfFeed(year, month, day);
  }
})();
