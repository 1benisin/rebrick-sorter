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

let parts = [];
// const STALE_TIME = 0;
const STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old

export default async (req, res) => {
  console.log('FETCH - parts');

  // fetch all parts from db
  if (!parts.length) {
    const q = query(collection(db, 'parts'), limit(1000));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      parts.push(doc.data());
    });
  }

  // update if stale
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // is stale or not have a timestamp
    const isStale =
      !part?.timestamp?.seconds ||
      Date.now() / 1000 - part?.timestamp?.seconds > STALE_TIME;

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
  }

  res.status(200).json(parts);
};
