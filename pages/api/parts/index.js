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
export const STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old
export const RESULTS_PER_PAGE = 100;

// fetches parts catalog from local file first then from db if local file is stale
export const getParts = async () => {
  // if parts already fetched, return them
  if (PARTS.length) return PARTS;

  const startTime = Date.now();

  // fetch local JSON part catalog file
  let localPartsCatalog = { timestamp: Date.now() - (STALE_TIME + 100), parts: [] }; // default to stale
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

  if (fileAge > STALE_TIME) updateCatalogFreshness();

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
  for (let part of parts) {
    // is stale if requirements aren't met
    let updatedPart = part;
    const isStale =
      !part?.timestamp?.seconds || // no timestamp
      Date.now() / 1000 - part?.timestamp?.seconds > STALE_TIME; // timestamp is stale

    if (isStale) {
      console.log(`part ${part.partId} is stale, fetching from Bricklink...`);
      // get Bricklink part details
      const brickLinkPartDetails = await fetchBricklinkURL(
        `https://api.bricklink.com/api/store/v1/items/part/${part.partId}`
      );
      console.log(`brickLinkPartDetails`, brickLinkPartDetails);

      if (brickLinkPartDetails) {
        updatedPart = {
          ...part,
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
        const i = PARTS.findIndex((p) => p.partId === updatedPart.partId);
        PARTS[i] = updatedPart;
      } else {
        console.warn(`part ${part.partId} exists on DB but not Bricklink`);
      }
    }

    freshParts.push(updatedPart);
    sleep(randomBetween(100, 500)); // sleep to avoid rate limiting db
  }

  return freshParts;
};
