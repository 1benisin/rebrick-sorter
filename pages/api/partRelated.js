import {
  serverTimestamp,
  doc,
  updateDoc,
  query,
  limit,
  collection,
  getDocs,
} from 'firebase/firestore';
import { randomBetween, fetchBricklinkURL, sleep } from '../../logic/utils';
import { db } from '../../logic/firebase';
import { fetchRelatedParts } from '../../dataManagers/partBasics';

// Path: /api/partRelated
export default async (req, res) => {
  const { partId } = req.query;
  const [error, parts] = await fetchRelatedParts(partId);

  error && res.status(500).json(error);

  res.status(200).json(parts);
};
