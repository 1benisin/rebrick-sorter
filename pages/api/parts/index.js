import { randomBetween, fetchBricklinkURL, sleep } from '../../../logic/utils';
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
const fs = require('fs');

let parts = [];
// const STALE_TIME = 0;
export const STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old
export const RESULTS_PER_PAGE = 200;

// fetches parts catalog from local file first then from db if local file is stale
export const getParts = async () => {
  // if parts haven't been loaded yet
  if (!parts.length) {
    const startTime = Date.now();

    // fetch local JSON part catalog file
    let localPartsCatalog = { timeStamp: Date.now(), parts: [] };
    if (fs.existsSync(process.cwd() + `/public/local_parts_catalog.json`)) {
      const data = fs.readFileSync(process.cwd() + `/public/local_parts_catalog.json`);
      localPartsCatalog = JSON.parse(data);
      parts = localPartsCatalog.parts;
    }
    const fileAge = Date.now() - localPartsCatalog.timeStamp;

    // if parts are stale set parts to local parts
    if (fileAge > STALE_TIME) {
      console.log(`refetching parts from db`);

      const databaseParts = [];
      // fetch all parts from db
      // const q = query(collection(db, 'part_basics'), limit(1000));
      // const querySnapshot = await getDocs(q);
      const querySnapshot = await getDocs(collection(db, 'parts'));
      querySnapshot.forEach((doc) => {
        databaseParts.push(doc.data());
      });

      // save parts to local JSON file
      localPartsCatalog = { timeStamp: Date.now(), parts: databaseParts };
      const jsonData = JSON.stringify(localPartsCatalog);
      fs.writeFileSync(process.cwd() + `/public/local_parts_catalog.json`, jsonData);

      parts = databaseParts;
    }

    const fetchTime = Date.now() - startTime;
    console.log(`Fetched ${parts.length} parts.
    Fetch took: ${fetchTime / 1000} seconds.
    Local catalog file is ${fileAge / 1000 / 60 / 60} hours old.`);
  }

  return parts;
};

const checkPartCatalogFreshness = async (partId) => {
  //
};

export default async (req, res) => {
  const startTime = Date.now();
  // fetch all parts from db if haven't already
  // if (!parts.length) {
  //   const q = query(collection(db, 'part_basics'), limit(1000));
  //   const querySnapshot = await getDocs(q);
  //   // const querySnapshot = await getDocs(collection(db, 'part_basics'));
  //   querySnapshot.forEach((doc) => {
  //     parts.push(doc.data());
  //   });
  // }
  const fetchedParts = await getParts();

  const fetchTime = Date.now() - startTime;
  res.status(200).json(`Fetched ${parts.length} parts. Fetch took: ${fetchTime / 1000} seconds`);
};

// --------------------------------------------

const oldFetch = async (req, res) => {
  console.log('FETCH - parts');

  // fetch all parts from db if haven't already
  if (!parts.length) {
    const q = query(collection(db, 'parts'), limit(1000));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      parts.push(doc.data());
    });
  }

  // update parts that are stale
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // is stale or not have a timestamp
    const isStale =
      !part?.timestamp?.seconds || Date.now() / 1000 - part?.timestamp?.seconds > STALE_TIME;

    if (isStale) {
      // get Bricklink
      const partDetails = await fetchBricklinkURL(
        `https://api.bricklink.com/api/store/v1/items/part/${part.partId}`
      );

      if (partDetails) {
        // update DB\
        await updateDoc(doc(db, 'parts', part.partId), {
          img: partDetails.image_url,
          timestamp: serverTimestamp(),
        });
        // update local
        parts[i] = { ...parts[i], img: partDetails.image_url };
      } else {
        console.warn(`part ${part.partId} exists on DB but not Bricklink`);
      }

      // delay so we don't overwhelm bricklink api
      sleep(randomBetween(100, 1000));
    }
  }

  res.status(200).json(parts);
};

const updateStaleParts = async () => {
  // is stale or not have a timestamp
  const isStale =
    !part?.timestamp?.seconds || Date.now() / 1000 - part?.timestamp?.seconds > STALE_TIME;

  if (isStale) {
    // get Bricklink
    const partDetails = await fetchBricklinkURL(
      `https://api.bricklink.com/api/store/v1/items/part/${part.partId}`
    );

    if (partDetails) {
      // update DB
      console.log(`updating image for part ${part.partId}`);
      await updateDoc(doc(db, 'parts', part.partId), {
        img: partDetails.image_url,
        timestamp: serverTimestamp(),
      });
      // update local
      parts[i] = { ...parts[i], img: partDetails.image_url };
    } else {
      console.warn(`part ${part.partId} exists on DB but not Bricklink`);
    }

    // delay so we don't overwhelm bricklink api
    sleep(randomBetween(100, 1000));
  }
};

export const test = () => {
  return 'test';
};
