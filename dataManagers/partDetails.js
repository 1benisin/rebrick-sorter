const OAuth = require('oauth').OAuth;
import {
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../logic/firebase';
import { fetchBricklinkURL } from './bricklink';

// const STALE_TIME = 0;
const STALE_TIME = 1000 * 60 * 60 * 24 * 30; // days old

export async function getPart(partId) {
  const docRef = doc(db, 'part_details', partId);
  const docSnap = await getDoc(docRef);
  let partDetails = docSnap.data();

  // if part not in DB
  if (!partDetails) return ['part not in firestore DB', null];

  // is part stale or not have a timestamp
  const isStale =
    !partDetails?.timestamp?.seconds ||
    Date.now() / 1000 - partDetails.timestamp.seconds > STALE_TIME;
  if (!isStale) return [null, partDetails];

  // fetch from bricklink
  partDetails = await fetchBricklinkURL(
    `https://api.bricklink.com/api/store/v1/items/part/${partId}`
  );

  // if part missing on bricklink as well
  if (!partDetails) return ['part not on firestore DB or Bricklink API', null];

  // add part to our db
  partDetails = {
    ...partDetails,
    image_url: partDetails?.image_url
      ? `https:${partDetails.image_url}`
      : '/fallback.webp',
    thumbnail_url: partDetails?.thumbnail_url
      ? `https:${partDetails.thumbnail_url}`
      : '/fallback.webp',
    timestamp: serverTimestamp(),
  };
  await setDoc(doc(db, 'part_details', partId), partDetails);

  return [null, partDetails];
}
