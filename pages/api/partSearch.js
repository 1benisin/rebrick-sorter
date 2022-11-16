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
import { fetchFilteredParts } from '../../dataManagers/partBasics';

export default async (req, res) => {
  const { filterText } = req.query;
  const [error, parts] = await fetchFilteredParts(filterText);

  error && res.status(500).json(error);

  res.status(200).json(parts);
};
