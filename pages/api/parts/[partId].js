const OAuth = require('oauth').OAuth;
import {
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../../logic/firebase';
import { fetchBricklinkURL } from '../../../logic/utils';
import { getPart } from '../../../dataManagers/partDetails';

// const STALE_TIME = 0;
const STALE_TIME = 1000 * 60 * 60 * 24 * 30; // days old

export default async (req, res) => {
  const { partId } = req.query;

  const [error, data] = await getPart(partId);

  error && res.status(500).json(error);
  res.status(200).json(data);
};
