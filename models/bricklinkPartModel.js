import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/services/firebase';
import { fetchBricklinkURL } from '../lib/services/bricklink';
import validateSchema from './validateSchema';
import { decodeHTML } from '../lib/utils';

const PART_STALE_TIME = 1000 * 60 * 60 * 24 * 30; // days old

// Define the structure of a Part by setting the data types for fields
const bricklinkPartSchema = {
  timestamp: { type: 'number', required: true },
  no: { type: 'string', required: true },
  name: { type: 'string' },
  type: { type: 'string' },
  category_id: { type: 'number' },
  alternate_no: { type: 'string' }, // could be multiple numbers separated by commas
  image_url: { type: 'string' },
  thumbnail_url: { type: 'string' },
  weight: { type: 'string' },
  dim_x: { type: 'string' },
  dim_y: { type: 'string' },
  dim_z: { type: 'string' },
  year_released: { type: 'number' },
  description: { type: 'string' },
  is_obsolete: { type: 'boolean' },
  language_code: { type: 'string' },
};

const defaultBricklinkPart = {
  name: null,
  type: null,
  category_id: 0,
  alternate_no: null,
  image_url: null,
  thumbnail_url: null,
  weight: null,
  dim_x: null,
  dim_y: null,
  dim_z: null,
  year_released: 0,
  description: null,
  is_obsolete: false,
  language_code: null,
};

export const getBricklinkPart = async (partId, forceUpdate = false) => {
  try {
    // fetch part details from firestore
    const partDoc = await getDoc(doc(db, 'bricklink_parts', partId));
    let part = partDoc.data(); // populate with default values

    // if part not on firestore or is stale, fetch from bricklink and update firestore
    if (forceUpdate || !part || !part.timestamp || Date.now() - part.timestamp > PART_STALE_TIME) {
      const url = `https://api.bricklink.com/api/store/v1/items/part/${partId}`;
      const blPart = await fetchBricklinkURL(url);
      if (blPart) {
        part = { ...blPart, timestamp: Date.now() };

        // normalize data
        if (blPart.name) part.name = decodeHTML(blPart.name);
        if (blPart.image_url) part.image_url = `https:${blPart.image_url}`;
        if (blPart.thumbnail_url) part.thumbnail_url = `https:${blPart.thumbnail_url}`;

        setBricklinkPart(part);
      }
    }

    part = validateSchema(part, bricklinkPartSchema);
    if (part.error) return { error: part.error };

    return part;
  } catch (error) {
    console.error(`Error fetching Bricklink part data: ${error}`);
    return { error };
  }
};

const setBricklinkPart = async (part) => {
  try {
    // populate missing fields with default values
    part = { ...defaultBricklinkPart, ...part };
    // validate part data
    part = validateSchema(part, bricklinkPartSchema);
    if (part.error) throw new Error(part.error);

    await setDoc(doc(db, 'bricklink_parts', part.no), part);
  } catch (error) {
    console.error(`Error setting Bricklink part data: ${error}`);
  }
};
