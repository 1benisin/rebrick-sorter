import { delay, decodeHTML } from '../../../lib/utils';
import { doc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/services/firebase';
const fs = require('fs');
import { validatePart } from '../../../models/partModel';
import { getBricklinkPart } from '../../../lib/services/bricklink';

//  ------------------- GLOBALS -------------------

let PARTS = null;
// const CATALOG_STALE_TIME = 0;
const CATALOG_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old
// const PART_STALE_TIME = 0;
const PART_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old
export const RESULTS_PER_PAGE = 30;
const LOCAL_CATALOG_URL = process.cwd() + `/public/parts_catalog.json`;

// ------------------- GET PARTS -------------------

export const getParts = async () => {
  // fetch parts catalog from local file first then from db if local file is stale
  try {
    // if parts already fetched, return them
    if (PARTS) return PARTS;

    // if local file doesn't exist yet, update/create it
    if (!fs.existsSync(LOCAL_CATALOG_URL)) await updateStaleCatalog();

    // fetch local JSON part catalog file
    const data = fs.readFileSync(LOCAL_CATALOG_URL);
    let localCatalog = JSON.parse(data);
    PARTS = localCatalog.parts;

    console.log(`Fetched local ${PARTS.length} parts.`);

    const fileAge = Date.now() - localCatalog.timestamp;
    console.log(
      `Local catalog file age: ${Math.floor(fileAge / 1000 / 60 / 60 / 24)} days, ${Math.floor(
        (fileAge / 1000 / 60 / 60) % 24
      )} hours, ${Math.floor((fileAge / 1000 / 60) % 60)} minutes, ${Math.floor(
        (fileAge / 1000) % 60
      )} seconds old.`
    );

    if (fileAge > CATALOG_STALE_TIME) await updateStaleCatalog();

    return PARTS;
  } catch (error) {
    console.error(`getParts issue: ${error}`);
    return { error };
  }
};

const updateStaleCatalog = async () => {
  console.log(`updating local catalog file...`);

  PARTS = [];
  // fetch all parts from db
  const querySnapshot = await getDocs(collection(db, 'parts'));
  querySnapshot.forEach((doc) => {
    PARTS.push(doc.data());
  });

  // save parts to local JSON file
  const localPartsCatalog = { timestamp: Date.now(), parts: PARTS };
  const jsonData = JSON.stringify(localPartsCatalog);
  fs.writeFileSync(LOCAL_CATALOG_URL, jsonData);

  console.log('updated local catalog file.');
};

export const updateStaleParts = async (parts) => {
  try {
    // create Map of parts that need updating
    const partsToUpdate = [];
    parts.forEach((part) => {
      if (!part?.bricklinkPart || !part?.timestamp || Date.now() - part.timestamp > PART_STALE_TIME)
        partsToUpdate.push(part);
    });

    // if no parts need updating, return
    if (!partsToUpdate.length) return parts;

    // get updated part data from Bricklink
    const updatedParts = [];
    for (const part of partsToUpdate) {
      const bricklinkPart = await getBricklinkPart(part.id);
      // if issue fetching part, skip it
      if (bricklinkPart.error) {
        console.warn(`issue fetching bricklink part ${part.id} - `, bricklinkPart.error);
        continue;
      }

      const updatedPart = {
        ...part,
        bricklinkPart,
        name: decodeHTML(part.name) || bricklinkPart.name || null,
        catId: part.catId || bricklinkPart.category_id || null,
        catName: part.catName || null,
        imageUrl: bricklinkPart.image_url || null,
        timestamp: Date.now(),
      };

      // validate part
      const validatedPart = await validatePart(updatedPart);
      if (validatedPart.error) {
        console.warn(`issue validating ${part.id} - `, validatedPart.error);
        continue;
      }

      // add to updated parts Map
      updatedParts.push(updatedPart);
    }

    // update local parts catalog file and global PARTS variable
    if (updatedParts.length) {
      PARTS = PARTS.map((part) => {
        const updatedPart = updatedParts.find((updatedPart) => updatedPart.id === part.id);
        if (updatedPart) return updatedPart;
        return part;
      });

      const localPartsCatalog = { timestamp: Date.now(), parts: PARTS };
      const jsonData = JSON.stringify(localPartsCatalog);
      fs.writeFile(LOCAL_CATALOG_URL, jsonData, (err) => {
        if (err) console.error(`error wrtiting local parts catalog file - `, err);
      });
    }

    // update db with updated parts in batches of 200
    let batch = writeBatch(db);
    let batchSize = 0;
    for (const part of updatedParts) {
      batch.set(doc(db, 'parts', part.id), part, { merge: true });
      batchSize++;
      if (batchSize >= 200) {
        await batch.commit();
        await delay(1000);
        batch = writeBatch(db);
        batchSize = 0;
      }
    }

    // update parts with updated parts and return it
    return parts.map((part) => {
      const updatedPart = updatedParts.find((updatedPart) => updatedPart.id === part.id);
      if (updatedPart) return updatedPart;
      return part;
    });
  } catch (error) {
    console.warn(error);
    return { error };
  }
};
