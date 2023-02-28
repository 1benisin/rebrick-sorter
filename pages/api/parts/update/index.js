const fs = require('fs');
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../../../lib/services/firebase';
const LOCAL_CATALOG_URL = process.cwd() + `/public/parts_catalog.json`;
import { validatePart } from '../../../../models/partModel';

// ------------------- UPDATE PART CATALOG -------------------
export default async (req, res) => {
  try {
    let { staleTime } = req.query;
    // if no staleTime is provided, default to 1 day
    staleTime = staleTime ? parseInt(staleTime) : 86400000;

    // load local catalog file
    const localCatalogFile = fs.readFileSync(LOCAL_CATALOG_URL);
    const localCatalog = JSON.parse(localCatalogFile);
    const localParts = localCatalog.parts;

    // find all parts that have a timestamp older than the staleTime
    const staleParts = localParts.filter((p) => Date.now() - p.timestamp > staleTime);
    const stalePartIds = staleParts.map((p) => p.id);

    // get all stale parts from db using a promise.all
    const promises = stalePartIds.map((id) => getDoc(doc(db, 'parts', id)));
    const allDocs = await Promise.all(promises);
    const freshParts = allDocs.map((doc) => doc.data()).filter((p) => p);

    console.log('freshParts', freshParts.slice(0, 5));

    // update local catalog file
    console.log(`saving catalog file...`);
    try {
      // update parts in local catalog
      const updatedLocalParts = localParts.map((p) => {
        const freshPart = freshParts.find((fp) => fp.id === p.id);
        return freshPart ? freshPart : p;
      });

      const updatedLocalCatalog = { timestamp: Date.now(), parts: updatedLocalParts };
      const jsonData = JSON.stringify(updatedLocalCatalog);
      fs.writeFile(LOCAL_CATALOG_URL, jsonData, (err) => {
        if (err) console.error(`error wrtiting local parts catalog file - `, err);
        else console.log(`Successfully updated local parts catalog file.`);
      });
    } catch (error) {
      console.error(`error writing local catalog file - ${error}`);
    }

    res.status(201).json({ message: 'Part catalog updated', staleParts: staleParts.length });
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
};
