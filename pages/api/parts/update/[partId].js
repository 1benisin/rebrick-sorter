const fs = require('fs');
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../../lib/services/firebase';
const LOCAL_CATALOG_URL = process.cwd() + `/public/parts_catalog.json`;
import { updatePart } from '../../../../models/partModel';

// ------------------- UPDATE PART  -------------------
export default async (req, res) => {
  try {
    const { partId } = req.query;
    let part = JSON.parse(req.body);

    const validatedPart = updatePart(part);

    // update part in db
    await setDoc(docRef, validatedPart, { merge: true });

    // update local catalog file
    console.log(`saving catalog file...`);
    try {
      // load local catalog file
      const localCatalogFile = fs.readFileSync(LOCAL_CATALOG_URL);
      const localCatalog = JSON.parse(localCatalogFile);

      // update part in local catalog
      const localParts = localCatalog.parts;
      const localPartIndex = localParts.findIndex((p) => p.id === partId);
      localParts[localPartIndex] = validatedPart;

      const updatedLocalCatalog = { timestamp: Date.now(), parts: localParts };
      const jsonData = JSON.stringify(updatedLocalCatalog);
      fs.writeFile(LOCAL_CATALOG_URL, jsonData, (err) => {
        if (err) console.error(`error wrtiting local parts catalog file - `, err);
        else console.log(`Successfully updated local parts catalog file.`);
      });
    } catch (error) {
      console.error(`error writing local catalog file - ${error}`);
    }

    res.status(201).json({ message: 'Part updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
};
