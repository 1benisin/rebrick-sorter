import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/services/firebase';
import { getBricklinkPart } from '../lib/services/bricklink';
import validateSchema from './validateSchema';
import { decodeHTML } from '../lib/utils';

const PART_STALE_TIME = 1000 * 60 * 60 * 24 * 7; // days old

// Define the structure of a Part by setting the data types for fields
const partSchema = {
  id: { type: 'string', required: true },
  timestamp: {
    type: 'number',
    required: true,
    conditions: [(p) => Date.now() - p.timestamp < PART_STALE_TIME],
  },
  name: { type: 'string', required: true },
  catId: { type: 'number' },
  catName: { type: 'string' },
  imageUrl: { type: 'string' },
  thumbnailUrl: { type: 'string' },
  weight: { type: 'string' },
  dimX: { type: 'string' },
  dimY: { type: 'string' },
  dimZ: { type: 'string' },
  bricklinkPart: { type: 'object', required: true },
};

export const validatePart = (part) => {
  const validatedPart = validateSchema(part, partSchema, 'log');
  if (validatedPart.error) return { id: part.id, error: validatedPart.error };
  return validatedPart;
};

export const updateParts = async (parts) => {
  const dbPromises = parts.map((part) => getDoc(doc(db, 'parts', part.id)));
  const partDocs = await Promise.all(dbPromises);
  const dbParts = partDocs.map((doc) => doc.data());

  const blParts = [];
  for (const part of parts) {
    console.log(part.id);
    const blPart = await getBricklinkPart(part.id);
    blParts.push(blPart);
  }

  const updatedParts = parts.map((part, i) => {
    const dbPart = dbParts[i];
    const blPart = blParts[i];
    if (blPart.error) {
      console.log(`Error getting part ${part.id} from Bricklink - ${blPart.error}`);
      return null;
    }

    const updatedPart = {
      ...dbPart,
      ...blPart,
      ...part,
      bricklinkPart: blPart,
      timestamp: Date.now(),
    };

    const formattedPart = {
      ...updatedPart,
      name: decodeHTML(updatedPart.name),
      catId: parseInt(updatedPart.catId),
    };

    // validate part
    const validatedPart = validatePart(formattedPart);
    if (validatedPart.error) {
      console.log(`Validation failed for part ${part.id} - ${validatedPart.error}`);
      return null;
    }

    return formattedPart;
  });

  // filter out nulls
  const filteredParts = updatedParts.filter((p) => p);

  return filteredParts;
};

export const updatePart = async (partId, part) => {
  console.log(`updating part ${partId}...`);
  try {
    // get part from db
    const partDoc = await getDoc(doc(db, 'parts', partId));
    if (!partDoc.exists()) {
      throw new Error(`Part ${partId} does not exist in db.`);
    }
    const dbPart = partDoc.data();

    const bricklinkPart = await getBricklinkPart(partId);
    if (bricklinkPart.error) {
      throw new Error(`Issue fetching bricklink part ${partId} - ${bricklinkPart.error}`);
    }

    const updatedPart = {
      ...dbPart,
      ...bricklinkPart,
      ...part,
      bricklinkPart,
      timestamp: Date.now(),
    };
    const formattedPart = {
      ...updatedPart,
      name: decodeHTML(updatedPart.name),
      catId: parseInt(updatedPart.catId),
    };

    // validate part
    const validatedPart = validatePart(formattedPart);
    if (validatedPart.error) {
      throw new Error(`Validation failed for part ${partId} - ${validatedPart.error}`);
    }

    return validatedPart;
  } catch (error) {
    console.warn(error);
    return { error };
  }
};
