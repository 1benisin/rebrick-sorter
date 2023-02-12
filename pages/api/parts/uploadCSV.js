const fs = require('fs');
const csv = require('csv-parser');
import { writeBatch, doc, getDocs, query, collection, limit } from 'firebase/firestore';
import { splitArrayIntoGroups, sleep } from '../../../logic/utils';
import { db } from '../../../lib/services/firebase';

// UPLOADS PARTS FROM A CSV FILE WITH NO HEADERS BUT COLUMNS IN ORDER (category Id, category Name,	part Id, part Name)
// FROM /public/bricklink_data/parts.csv TO FIRESTORE PARTS COLLECTIONS
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
  const csvParts = await readCSV(process.cwd() + '/public/bricklink_data/parts.csv');
  console.log('csvParts: ', csvParts.slice(0, 2));

  // ------------------ CREATE ARRAY OF PARTS NOT IN DB PART COLLECTION ------------------
  console.log('downloading all parts from DB...');

  // get all existing parts from db parts collection
  const docs = await getDocs(collection(db, 'parts'));
  // const docs = await getDocs(query(collection(db, 'parts'), limit(10)));

  // create a partsToAdd array of part ids that are not in db parts collection
  const partsToAdd = [];
  docs.forEach((doc) => {
    const part = doc.data();

    const shouldAddPart =
      !csvParts.some((p) => {
        return p['2'] === doc.id; // '2' in csv is the 3rd column and is part id
      }) || // if part is not in csvParts
      !part.id; // or if part does not have an id property

    if (shouldAddPart) partsToAdd.push(doc.id);
  });

  // ------------------ UPLOAD NEW PARTS  ------------------
  // split csv file for batch upload to DB
  const groupCount = partsToAdd.length / 400;
  const splitParts = splitArrayIntoGroups(partsToAdd, groupCount);

  // upload each part in batches to DB
  for (let i = 0; i < splitParts.length; i++) {
    const curPartsGroup = splitParts[i];

    const batch = writeBatch(db);

    curPartsGroup.forEach((p) => {
      const partWithPropertyNames = {
        category_id: p['0'],
        category_name: p['1'],
        id: p['2'],
        name: p['3'],
      };
      batch.set(doc(db, 'parts', partWithPropertyNames.id), partWithPropertyNames);
    });

    await batch.commit();

    console.log(i, 'groups of ', Math.round(groupCount), 'parts uploaded to DB');
    await sleep(1000);
  }

  // ------------------ RESPONSE ------------------
  const response = `
  ${partsToAdd.length} parts uploaded from CSV file to PARTS collection on Firbase DB.`;

  console.log(response);
  res.status(200).json(response);
};
