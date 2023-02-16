const fs = require('fs');
const csv = require('csv-parser');
import { writeBatch, doc, getDocs, query, collection, limit } from 'firebase/firestore';
import { splitArrayIntoGroups, sleep } from '../../../lib/utils';
import { db } from '../../../lib/services/firebase';

// UPLOADS PARTS FROM AN XML FILE WITH ITEM TAGS CONTAINING FIELDS (ITEMTYPE, ITEMID, ITEMNAME, CATEGORY)
// FROM /public/bricklink_data/parts.xml TO FIRESTORE PARTS COLLECTIONS
// ONLY WILL UPLOAD PARTS THAT ARE NOT ALREADY IN FIRESTORE

export default async (req, res) => {
  // ------------------ READ XML FILE ------------------
  const readXML = (fileURL) => {
    return new Promise((resolve, reject) => {
      fs.readFile(fileURL, (err, data) => {
        if (err) {
          reject(err);
        } else {
          xml2js.parseString(data, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result.CATALOG.ITEM);
            }
          });
        }
      });
    });
  };
  const xmlParts = await readXML(process.cwd() + '/public/bricklink_data/parts.xml');
  console.log('xmlParts: ', xmlParts.slice(0, 2));

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
      !xmlParts.some((p) => {
        return p.ITEMID[0] === doc.id;
      }) || // if part is not in xmlParts
      !part.id; // or if part does not have an id property

    if (shouldAddPart) partsToAdd.push(doc.id);
  });

  // ------------------ UPLOAD NEW PARTS  ------------------
  // split xml file for batch upload to DB
  const groupCount = partsToAdd.length / 400;
  const splitParts = splitArrayIntoGroups(partsToAdd, groupCount);

  // upload each part in batches to DB
  for (let i = 0; i < splitParts.length; i++) {
    const curPartsGroup = splitParts[i];

    const batch = writeBatch(db);

    curPartsGroup.forEach((p) => {
      const partWithPropertyNames = {
        catId: p.CATEGORY[0],
        id: p.ITEMID[0],
        name: p.ITEMNAME[0],
      };
      batch.set(doc(db, 'parts', partWithPropertyNames.id), partWithPropertyNames);
    });

    await batch.commit();

    console.log(i, 'groups of ', Math.round(groupCount), 'parts uploaded to DB');
    await sleep(1000);
  }

  // ------------------ RESPONSE ------------------
  const response = `
  ${partsToAdd.length} parts uploaded from XML file to PARTS collection on Firbase DB.`;

  console.log(response);

  res.status(200).json(response);
};
