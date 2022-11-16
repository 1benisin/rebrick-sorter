const fs = require('fs');
const csv = require('csv-parser');
import {
  writeBatch,
  doc,
  getDocs,
  query,
  collection,
  limit,
} from 'firebase/firestore';
import { splitArrayIntoGroups, sleep } from '../../../logic/utils';
import { db } from '../../../logic/firebase';

// UPLOADS PARTS FROM A CSV FILE WITH NO HEADERS BUT COLUMNS IN ORDER (category Id, category Name,	part Id, part Name)
// FROM /public/bricklink_data/parts.csv TO FIRESTORE PART_BASICS & PARTS_DETAILS COLLECTIONS
// ONLY WILL UPLOAD PARTS THAT ARE NOT ALREADY IN FIRESTORE

export default async (req, res) => {
  // ------------------ READ CSV FILE ------------------
  const readCSV = (fileURL) => {
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(fileURL)
        .pipe(csv({ headers: false }))
        .on('data', (data) => results.push(data))
        .on('end', () => {
          resolve(results);
        });
    });
  };
  const csvParts = await readCSV(
    process.cwd() + '/public/bricklink_data/parts.csv'
  );

  // ------------------ CREATE ARRAY OF PARTS NOT IN PART_BASICS COLLECTION ------------------
  console.log('downloading all part basics...');
  // get all existing parts from part_basics collection
  const existingBasicPartIds = [];
  const docs = await getDocs(collection(db, 'part_basics'));
  // const docs = await getDocs(query(collection(db, 'parts'), limit(10)));
  docs.forEach((doc) => {
    existingBasicPartIds.push(doc.id);
  });
  // filter csvParts out that already exist in part_basics collection
  const newBasicParts = csvParts.filter((p) => {
    return !existingBasicPartIds.includes(p['2']);
  });

  // ------------------ CREATE ARRAY OF PARTS NOT IN PART_DETAILS COLLECTION ------------------
  console.log('downloading all part details...');
  // get all existing parts from part_basics collection
  const existingDetailPartIds = [];
  const detailDocs = await getDocs(collection(db, 'part_details'));
  // const detailDocs = await getDocs(query(collection(db, 'parts'), limit(10)));
  detailDocs.forEach((doc) => {
    existingDetailPartIds.push(doc.id);
  });
  // filter csvParts out that already exist in part_basics collection
  const newDetailParts = csvParts.filter((p) => {
    return !existingDetailPartIds.includes(p['2']);
  });

  // ------------------ UPLOAD NEW PARTS  ------------------
  const uploadNewParts = async (newParts, collectionName) => {
    // split csv file for batch upload to DB
    const groupCount = newParts.length / 400;
    const splitParts = splitArrayIntoGroups(newParts, groupCount);

    // upload each part in batches to DB
    for (let i = 0; i < splitParts.length; i++) {
      const split = splitParts[i];

      const batch = writeBatch(db);

      split.forEach((p) => {
        const partWithPropertyNames = {
          catId: p['0'],
          catName: p['1'],
          id: p['2'],
          name: p['3'],
        };
        batch.set(
          doc(db, collectionName, partWithPropertyNames.id),
          partWithPropertyNames
        );
      });

      await batch.commit();

      console.log(i, 'groups of ', groupCount, 'complete');
      await sleep(1000);
    }
  };

  await uploadNewParts(newBasicParts, 'part_basics');
  await uploadNewParts(newDetailParts, 'part_details');

  // ------------------ RESPONSE ------------------
  const response = `
  ${newBasicParts.length} parts uploaded from CSV file to PARTS_BASICS collection. ${existingBasicPartIds.length} already existed. 
  ${newDetailParts.length} parts uploaded from CSV file to PART_DETAILS collection. ${existingDetailPartIds.length} already existed.
  `;

  console.log(response);
  res.status(200).json(response);
};
