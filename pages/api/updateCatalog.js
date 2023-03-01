const fs = require('fs');
import { getDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/services/firebase';
const LOCAL_CATALOG_URL = process.cwd() + `/public/parts_catalog.json`;
import { updatePart, updateParts } from '../../models/partModel';

const PART_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old

// ------------------- UPDATE PART CATALOG -------------------
export default async (req, res) => {
  try {
    let { staleTime } = req.query;
    // if no staleTime is provided, default to 1 day
    staleTime = staleTime ? parseInt(staleTime) : PART_STALE_TIME;

    // load local catalog file
    const localCatalogFile = fs.readFileSync(LOCAL_CATALOG_URL);
    const localCatalog = JSON.parse(localCatalogFile);
    const localParts = localCatalog.parts;

    // find all parts that have no timestamp or a timestamp older than the staleTime
    const staleParts = localParts.filter(
      (p) => !p?.timestamp || Date.now() - p.timestamp > staleTime
    );
    const stalePartIds = staleParts.map((p) => ({ id: p.id }));

    // divide parts into chunks of 50
    const partIdChunks = [];
    for (let i = 0; i < stalePartIds.length; i += 200) {
      partIdChunks.push(stalePartIds.slice(i, i + 200));
    }

    const freshParts = [];
    for (const [i, chunk] of partIdChunks.entries()) {
      console.log(`updating chunk: ${i} of ${partIdChunks.length}`);
      // for each stale part, update with fresh data from db
      const updatedParts = await updateParts(chunk); // will be validated
      const dbUpdatePromises = updatedParts.map((p) => setDoc(doc(db, 'parts', p.id), p));
      await Promise.all(dbUpdatePromises);
      freshParts.push(...updatedParts);

      // update local catalog file
      console.log(`saving catalog file...`);
      try {
        // update parts in local catalog
        const updatedLocalParts = localParts.map((p) => {
          const freshPart = freshParts.find((fp) => fp.id === p.id);
          return freshPart ? freshPart : p;
        });

        // only keep needed properties
        const minimizedParts = updatedLocalParts.map((p) => {
          return {
            timestamp: p.timestamp,
            id: p.id,
            name: p.name,
            catName: p.catName,
            thumbnailUrl: p.thumbnailUrl,
            weight: p.weight,
            dimX: p.dimX,
            dimY: p.dimY,
            dimZ: p.dimZ,
          };
        });

        // write to file
        const updatedLocalCatalog = { timestamp: Date.now(), parts: minimizedParts };
        const jsonData = JSON.stringify(updatedLocalCatalog);
        fs.writeFile(LOCAL_CATALOG_URL, jsonData, (err) => {
          if (err) console.error(`error wrtiting local parts catalog file - `, err);
          else console.log(`Successfully updated local parts catalog file.`);
        });
      } catch (error) {
        console.error(`error writing local catalog file - ${error}`);
      }
    }

    res.status(201).json({ message: 'Part catalog updated', staleParts: staleParts.length });
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
};
