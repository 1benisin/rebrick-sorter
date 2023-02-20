import { delay, decodeHTML } from '../../../lib/utils';
import { doc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/services/firebase';
const fs = require('fs');
import { validatePart, updatePart } from '../../../models/partModel';
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

    PARTS = await loadCatalogFile();

    console.log(`Fetched local ${PARTS.length} parts.`);

    return PARTS;
  } catch (error) {
    console.error(`getParts issue: ${error}`);
    return { error };
  }
};

const loadCatalogFile = async () => {
  console.log(`loading local catalog file...`);
  try {
    const data = fs.readFileSync(LOCAL_CATALOG_URL);
    const catalogData = JSON.parse(data);

    const catalogAge = Date.now() - catalogData.timestamp;
    console.log(
      `Catalog age: ${Math.floor(catalogAge / 1000 / 60 / 60 / 24)} d, ${Math.floor(
        (catalogAge / 1000 / 60 / 60) % 24
      )} h, ${Math.floor((catalogAge / 1000 / 60) % 60)} m old.`
    );

    if (catalogAge > CATALOG_STALE_TIME) await refreshCatalog();

    return catalogData.parts;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.log('Error: Local catalog file is invalid JSON.');
      await refreshCatalog();
      await loadCatalogFile();
    } else {
      console.log(`Error: ${error.message}`);
    }
  }
};

const refreshCatalog = async () => {
  console.log(`refreshing catalog...`);

  PARTS = [];
  // fetch all parts from db
  const querySnapshot = await getDocs(collection(db, 'parts'));
  querySnapshot.forEach((doc) => {
    PARTS.push(doc.data());
  });

  saveCatalogFile(PARTS);
};

const filterPartsToUpdate = (parts) => {
  // filter out parts that don't need updating
  const partsToUpdate = parts.filter((part) => {
    const validatedPart = validatePart(part);
    if (validatedPart.error) return true;
    return false;
  });
  return partsToUpdate;
};

const saveCatalogFile = (parts) => {
  console.log(`saving catalog file...`);
  try {
    const localPartsCatalog = { timestamp: Date.now(), parts: parts };
    const jsonData = JSON.stringify(localPartsCatalog);
    fs.writeFile(LOCAL_CATALOG_URL, jsonData, (err) => {
      if (err) console.error(`error wrtiting local parts catalog file - `, err);
      else console.log(`Successfully updated local parts catalog file.`);
    });
  } catch (error) {
    console.error(`error writing local catalog file - ${error}`);
  }
};

const updateDatabase = async (updatedParts) => {
  try {
    const batch = writeBatch(db);
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

    console.log('Successfully updated database with new part data.');
  } catch (error) {
    console.error('Error updating database with new part data:', error);
  }
};

const updateCatalogWithParts = async (updatedParts) => {
  // --- update local variable & catalog file, & db ---

  if (updatedParts.length) {
    // update global PARTS array
    PARTS = PARTS.map((part) => {
      const updatedPart = updatedParts.find((updatedPart) => updatedPart.id === part.id);
      if (updatedPart) return updatedPart;
      return part;
    });

    saveCatalogFile(PARTS); //  should not wait to finish

    updateDatabase(updatedParts);
  }
};

export const refreshParts = async (parts) => {
  try {
    // --- filter parts that need updating ---
    const partsToUpdate = filterPartsToUpdate(parts);
    console.log(`partsToUpdate: ${partsToUpdate.length} / ${parts.length} parts`);
    // if no parts need updating, return original parts
    if (!partsToUpdate.length) return parts;

    // --- update parts ---
    const updatedParts = [];
    for (const part of partsToUpdate) {
      const updatedPart = await updatePart(part);
      // if issue fetching part, skip it
      if (updatedPart.error) {
        console.warn(`issue fetching bricklink data ${part.id} - `, updatedPart.error);
        continue;
      }
      // add to updated parts Map
      updatedParts.push(updatedPart);
    }

    // --- update local variable, catalog file, & db ---
    updateCatalogWithParts(updatedParts);

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
