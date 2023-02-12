import {
  serverTimestamp,
  doc,
  updateDoc,
  query,
  limit,
  collection,
  getDocs,
} from 'firebase/firestore';
import { randomBetween, fetchBricklinkURL, sleep } from '../../lib/utils';
import { db } from '../../lib/services/firebase';
import { fetchRelatedParts } from '../../dataManagers/partBasics';

// Path: /api/partRelated
export default async (req, res) => {
  const { partId } = req.query;
  const [error, parts] = await fetchRelatedParts(partId);

  error && res.status(500).json(error);

  res.status(200).json(parts);
};
