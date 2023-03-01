const fs = require('fs');
const xml2js = require('xml2js');
import { writeBatch, doc, getDocs, query, collection, limit } from 'firebase/firestore';
import { splitArrayIntoGroups, sleep } from '../../../lib/utils';
import { db } from '../../../lib/services/firebase';

// UPLOADS PARTS FROM AN XML FILE WITH ITEM TAGS CONTAINING FIELDS (ITEMTYPE, ITEMID, ITEMNAME, CATEGORY)
// FROM /public/bricklink_data/parts.xml TO FIRESTORE PARTS COLLECTIONS
// ONLY WILL UPLOAD PARTS THAT ARE NOT ALREADY IN FIRESTORE

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

export default async (req, res) => {
  try {
    // ------------------ READ XML FILE ------------------
    let xmlParts = await readXML(process.cwd() + '/public/bricklink_data/categories.xml');
    // reformat xmlParts array
    xmlParts = xmlParts.map((item) => ({
      ITEMTYPE: item.ITEMTYPE[0],
      ITEMID: item.ITEMID[0],
      ITEMNAME: item.ITEMNAME[0],
      CATEGORY: item.CATEGORY[0],
    }));
    console.log('xmlParts: ', xmlParts.slice(0, 2));
    console.log(`${xmlParts.length} parts pulled from XML file`);

    // ------------------ GET ALL PARTS FROM DB ------------------
    console.log('downloading all parts from DB...');

    // get all existing parts from db parts collection
    const allPartsSnapshot = await getDocs(collection(db, 'parts'));
    const dbPartIds = new Set();
    let dbPartCount = 0;
    allPartsSnapshot.forEach((d) => {
      dbPartIds.add(d.id);
      dbPartCount++;
    });
    console.log(`${dbPartCount} parts downloaded from DB`);

    // create a xmlPartsToAdd array of parts not in db parts collection
    const xmlPartsToAdd = xmlParts.filter((p) => !dbPartIds.has(p.ITEMID));
    console.log('xml parts to add sample: ', xmlPartsToAdd.slice(0, 2));

    // ------------------ UPLOAD NEW XML PARTS  ------------------
    // split xml file for batch upload to DB
    const numOfGroups = xmlPartsToAdd.length / 400;
    const xmlPartGroups = splitArrayIntoGroups(xmlPartsToAdd, numOfGroups);

    // upload each part in batches to DB
    for (let i = 0; i < xmlPartGroups.length; i++) {
      const curXMLParts = xmlPartGroups[i];

      const batch = writeBatch(db);

      curXMLParts.forEach((p) => {
        const normalizedPart = {
          catId: p.CATEGORY,
          id: p.ITEMID,
          name: p.ITEMNAME,
        };
        batch.set(doc(db, 'parts', normalizedPart.id), normalizedPart);
      });

      await batch.commit();

      console.log(i, 'groups of ', Math.round(numOfGroups), 'parts uploaded to DB');
      await sleep(1000);
    }

    // ------------------ RESPONSE ------------------
    const response = `${xmlPartsToAdd.length} parts uploaded from XML file to PARTS collection on Firbase DB.`;

    console.log(response);

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
};
