const OAuth = require('oauth').OAuth;
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../logic/firebase';

const colors = [];

export default async (req, res) => {
  console.log('FETCH - colors');

  // if colors have already been fetched from Firestore
  if (colors.length) {
    res.status(200).json(colors);
    return;
  }

  // else if colors not fetched yet
  const docs = await getDocs(collection(db, 'bricklink_colors'));
  docs.forEach((doc) => {
    colors.push(doc.data());
  });
  res.status(200).json(colors);
  return;
};
