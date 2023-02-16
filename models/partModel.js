import { serverTimestamp, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/services/firebase';
import { getBricklinkPart } from './bricklinkPartModel';
import validateSchema from './validateSchema';

const PART_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old

// Define the structure of a Part by setting the data types for fields
const partSchema = {
  id: { type: 'string', required: true },
  timestamp: { type: 'number', required: true },
  name: { type: 'string', required: true },
  catId: { type: 'number' },
  catName: { type: 'string' },
  imageUrl: { type: 'string' },
};

export const validatePart = async ({ part, forceUpdate = false }) => {
  try {
    // does part need to be updated?
    if (forceUpdate || !part.timestamp || Date.now() - part.timestamp > PART_STALE_TIME) {
      part = await updatePart(part);
    }

    // validate part data

    part = validateSchema(part, partSchema);
    if (part.error) return { error: part.error };

    return part;
  } catch (error) {
    console.error(error);
    return { error };
  }
};

const updatePart = async (part) => {
  try {
    const bricklinkPart = await getBricklinkPart(part.id);
    // const scrapedPart = await scrapePart(partId); // eventually
    if (bricklinkPart.error) return { error: bricklinkPart.error };

    const updatedPart = {
      ...part,
      bricklinkPart,
      name: part.name || bricklinkPart.name || null,
      catId: part.catId || bricklinkPart.category_id || null,
      catName: part.catName || null,
      imageUrl: bricklinkPart.image_url || null,
      timestamp: Date.now(),
    };

    // update the part in the database
    const partRef = doc(db, 'parts', part.id);
    await setDoc(partRef, updatedPart, { merge: true });

    return updatedPart;
  } catch (error) {
    console.error(error);
    return { error };
  }
};
