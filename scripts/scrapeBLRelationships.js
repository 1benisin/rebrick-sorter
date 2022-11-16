'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min) + min);

async function scrapePage(page, pageNum) {
  let rowHandles = await page.$$(
    `#id-main-legacy-table > tbody > tr > td > table:nth-child(4) > tbody > tr > td > font > form > table > tbody > tr`
  );
  const relationshipGroups = [];

  for (let i = 0; i < rowHandles.length; i++) {
    console.log('page ', pageNum, ' - ', i, ' of ', rowHandles.length);
    const rowH = rowHandles[i];

    const bgColor = await page.evaluate((el) => el.bgColor, rowH);

    // if header row
    if (bgColor == '#5E5A80') {
      relationshipGroups.push([]);
      continue;
    }
    // if part row
    if (bgColor == '#EEEEEE' || bgColor == '#FFFFFF') {
      const partId = await rowH.$eval(
        'td:nth-child(2) > font > a',
        (el) => el.innerText
      );
      relationshipGroups[relationshipGroups.length - 1].push(partId);
    }
  }

  return relationshipGroups;
}

async function launchBrowser(url) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      slowMo: 10,
    });

    // -- click to accept cookies popup
    const page = await browser.newPage();
    await page.goto(url);
    // await delay(2000);
    const acceptCookiesButtonSelector =
      '#js-btn-save > button.btn.btn--white.text--bold.l-border.cookie-notice__btn';
    await page.waitForSelector(acceptCookiesButtonSelector);
    await page.click(acceptCookiesButtonSelector, {
      delay: rand(10, 500),
    });
    await delay(2000);

    // scrape all pages
    let allPagesData = [];
    for (let i = 1; i <= numberOfPages; i++) {
      await page.goto(`${scrapeUrl}&pg=${i}`);
      const pageData = await scrapePage(page, i);
      allPagesData = [...allPagesData, ...pageData];
    }

    // save data to json file
    const jsonData = JSON.stringify(allPagesData);
    fs.writeFileSync(`public/scrapedData/${saveFileName}.json`, jsonData);

    console.log('DONE');
    await browser.close();
  } catch (error) {
    console.error(error);
  }
}

launchBrowser('https://www.bricklink.com');

// number of pages to scrape. pg= in url string
const numberOfPages = 1;
// relID= in url string
const relationshipId = 21;
// file name to be saved under public/scrapedData
const saveFileName = 'parts_that_belong_together';
// &pg= will be appended to end of url to scrape number of pages
const scrapeUrl = `https://www.bricklink.com/catalogRelList.asp?v=0&relID=${relationshipId}`;

// // READ JSON FILE
// const data = fs.readFileSync('public/scrapedData/part_mold_relationships.json');
// const obj = JSON.parse(data);
// const count = obj.reduce((a, b) => a + b.length, 0);
// console.log(count);
