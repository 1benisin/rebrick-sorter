import { randomBetween, sleep } from '../../../lib/utils';
import { doc, updateDoc, getDoc, query, limit, collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/services/firebase';
const fs = require('fs');
import { decodeHTML } from '../../../lib/utils';
import { validatePart } from '../../../models/partModel';

let PARTS = [];
// const CATALOG_STALE_TIME = 0;
const CATALOG_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old
// const PART_STALE_TIME = 0;
const PART_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old

export const RESULTS_PER_PAGE = 30;

// fetches parts catalog from local file first then from db if local file is stale
export const getParts = async () => {
  // if parts already fetched, return them
  if (PARTS.length) return PARTS;

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

  // checkPartsFreshness(databaseParts);

  PARTS = databaseParts;
};

// export default async (req, res) => {
//   const startTime = Date.now();
//   const fetchedParts = await getParts();

//   const fetchTime = Date.now() - startTime;
//   res.status(200).json(`Fetched ${PARTS.length} parts. Fetch took: ${fetchTime / 1000} seconds`);
// };

export const checkPartsFreshness = async (parts) => {
  try {
    // create list of stale parts
    const staleParts = [];

    for (let [index, part] of parts.entries()) {
      part = await validatePart(part);
      if (part.error) {
        console.warn(`issue validating ${part.id} - `, part.error);
        continue;
      }

      // update local
      let k = PARTS.findIndex((p) => p.id === part.id);
      console.log(`updating local part ${PARTS[index]} at index ${index} with `, part);
      PARTS[k] = part;

      parts[index] = part;
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
      console.log(`updated local parts catalog file`);
    }
  } catch (error) {
    console.warn(error);
    return { error };
  }

  return parts;
};

const doesPartNeedsUpdating = (part) => {
  let needsUpdate = false;

  if (!part?.timestamp) {
    console.log(part.id, 'part is missing timestamp property', part.timestamp);
    needsUpdate = true;
  }

  if (!part?.image_url) {
    console.log(part.id, 'part is missing image_url property');
    needsUpdate = true;
  }

  if (!part?.thumbnail_url) {
    console.log(part.id, 'part is missing thumbnail_url property');
    needsUpdate = true;
  }

  if (!part?.image_url?.startsWith('https:')) {
    console.log(part.id, 'image_url does not start with https:');
    needsUpdate = true;
  }

  if (!part?.thumbnail_url?.startsWith('https:')) {
    console.log(part.id, 'thumbnail_url does not start with https:');
    needsUpdate = true;
  }

  if (!!part?.partId) {
    console.log(part.id, 'part has old property partId');
    needsUpdate = true;
  }

  if (!!part?.catName) {
    console.log(part.id, 'part has old property catName');
    needsUpdate = true;
  }

  if (!!part?.catId) {
    console.log(part.id, 'part has old property catId');
    needsUpdate = true;
  }

  if (!!part?.partName) {
    console.log(part.id, 'part has old property partName');
    needsUpdate = true;
  }

  if (!!part?.no) {
    console.log(part.id, 'part has old property no');
    needsUpdate = true;
  }

  if (Date.now() / 1000 - part?.timestamp?.seconds > PART_STALE_TIME) {
    console.log(part.id, 'part data is stale');
    needsUpdate = true;
  }

  if (needsUpdate) console.log(part.id, 'needs update:', part);

  return needsUpdate;
};
