import { randomBetween, sleep } from '../../../logic/utils';
import {
  serverTimestamp,
  doc,
  updateDoc,
  query,
  limit,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../../logic/firebase';
import { fetchBricklinkURL } from '../../../lib/services/bricklink';
const fs = require('fs');

let PARTS = [];
// const STALE_TIME = 0;
export const CATALOG_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old
export const RESULTS_PER_PAGE = 30;

// fetches parts catalog from local file first then from db if local file is stale
export const getParts = async () => {
  // if parts already fetched, return them
  if (PARTS.length) return PARTS;

  const startTime = Date.now();

  // fetch local JSON part catalog file
  let localPartsCatalog = { timestamp: Date.now() - (CATALOG_STALE_TIME + 100), parts: [] }; // default to stale
  if (fs.existsSync(process.cwd() + `/public/parts_catalog.json`)) {
    const data = fs.readFileSync(process.cwd() + `/public/parts_catalog.json`);
    localPartsCatalog = JSON.parse(data);
    PARTS = localPartsCatalog.parts;
  }

  console.log(`Fetched ${PARTS.length} parts.`);

  const fileAge = Date.now() - localPartsCatalog.timestamp;
  console.log(`Local catalog file age:
  ${Math.floor(fileAge / 1000 / 60 / 60 / 24)} days,
  ${Math.floor((fileAge / 1000 / 60 / 60) % 24)} hours,
  ${Math.floor((fileAge / 1000 / 60) % 60)} minutes,
  ${Math.floor((fileAge / 1000) % 60)} seconds old.`);

  if (fileAge > CATALOG_STALE_TIME) updateCatalogFreshness();

  return PARTS;
};

const updateCatalogFreshness = async () => {
  console.log(`updating local catalog file from db`);

  const databaseParts = [];
  // fetch all parts from db
  const querySnapshot = await getDocs(collection(db, 'parts'));
  querySnapshot.forEach((doc) => {
    databaseParts.push(doc.data());
  });

  // save parts to local JSON file
  const localPartsCatalog = { timestamp: Date.now(), parts: databaseParts };
  const jsonData = JSON.stringify(localPartsCatalog);
  fs.writeFileSync(process.cwd() + `/public/parts_catalog.json`, jsonData);

  PARTS = databaseParts;
};

// export default async (req, res) => {
//   const startTime = Date.now();
//   const fetchedParts = await getParts();

//   const fetchTime = Date.now() - startTime;
//   res.status(200).json(`Fetched ${PARTS.length} parts. Fetch took: ${fetchTime / 1000} seconds`);
// };

export const checkPartsFreshness = async (parts) => {
  const freshParts = [];
  const staleParts = [];

  // seperate out stale and fresh parts
  for (let part of parts) {
    // is stale if requirements aren't met
    const partNeedsUpdate =
      !part?.timestamp || // no timestamp
      Date.now() / 1000 - part?.timestamp?.seconds > CATALOG_STALE_TIME || // timestamp is stale
      !part?.image_url || // missing image_url
      !part?.thumbnail_url; // missing thumbnail_url

    console.log(
      `part ${part.partId} is stale:`,
      !part?.timestamp?.seconds, // no timestamp
      Date.now() / 1000 - part?.timestamp?.seconds > CATALOG_STALE_TIME, // timestamp is stale
      !part?.image_url, // missing image_url
      !part?.thumbnail_url
    );
    if (partNeedsUpdate) staleParts.push(part);
    else freshParts.push(part);
  }

  // update stale parts
  for (let part of staleParts) {
    let updatedPart = part;
    console.log(`part ${part.partId} is stale, fetching from Bricklink...`);
    // get Bricklink part details
    const brickLinkPartDetails = await fetchBricklinkURL(
      `https://api.bricklink.com/api/store/v1/items/part/${part.partId}`
    );
    // console.log(`brickLinkPartDetails`, brickLinkPartDetails);

    if (brickLinkPartDetails) {
      updatedPart = {
        ...updatedPart,
        ...brickLinkPartDetails,
        image_url: brickLinkPartDetails?.image_url
          ? `https:${brickLinkPartDetails.image_url}`
          : '/fallback.webp',
        thumbnail_url: brickLinkPartDetails?.thumbnail_url
          ? `https:${brickLinkPartDetails.thumbnail_url}`
          : '/fallback.webp',
        timestamp: serverTimestamp(),
      };

      // update DB
      await updateDoc(doc(db, 'parts', part.partId), updatedPart);

      // update local
      const i = PARTS.findIndex((p) => p.partId === part.partId);
      PARTS[i] = updatedPart;
    } else {
      console.warn(`part ${part.partId} exists on DB but not Bricklink`);
    }

    // console.log(`updatedPart freshness`, updatedPart);

    freshParts.push(updatedPart);
    // sleep(randomBetween(100, 300)); // sleep to avoid rate limiting db
  }

  // resave parts catalog file if any parts were updated
  if (staleParts.length) {
    const localPartsCatalog = { timestamp: Date.now(), parts: PARTS };
    const jsonData = JSON.stringify(localPartsCatalog);
    fs.writeFile(
      process.cwd() + `/public/parts_catalog.json`,
      jsonData,
      (error) => error && console.error(error)
    );
  }

  return freshParts;
};
