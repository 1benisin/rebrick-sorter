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
  catId: { type: 'string' },
  catName: { type: 'string' },
  imageUrl: { type: 'string' },
  thumbnailUrl: { type: 'string' },
  type: { type: 'string' },
  bricklinkPart: { type: 'object', required: true },
};

export const validatePart = (part) => {
  const validatedPart = validateSchema(part, partSchema);
  if (validatedPart.error) return { id: part.id, error: validatedPart.error };
  return validatedPart;
};

export const updatePart = async (part) => {
  console.log(`updating part ${part.id}...`);
  try {
    const bricklinkPart = await getBricklinkPart(part.id);
    if (bricklinkPart.error) {
      throw new Error(`Issue fetching bricklink part ${part.id} - ${bricklinkPart.error}`);
    }

    const updatedPart = {
      ...part,
      timestamp: Date.now(),
      name: decodeHTML(part.name) || bricklinkPart.name || null,
      catId: part.catId || bricklinkPart.category_id || null,
      catName: part.catName || null,
      imageUrl: bricklinkPart.image_url || null,
      thumbnailUrl: bricklinkPart.thumbnail_url || null,
      type: bricklinkPart.type || null,
      bricklinkPart,
    };

    return updatedPart;
  } catch (error) {
    console.warn(error);
    return { error };
  }
};
