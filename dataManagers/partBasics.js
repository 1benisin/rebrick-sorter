import {
  serverTimestamp,
  doc,
  updateDoc,
  query,
  limit,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '../logic/firebase';
import { randomBetween, fetchBricklinkURL, sleep } from '../logic/utils';

const parts = [];
let splitPartNames = [];

const RESULTS_PER_PAGE = 100;
const STALE_TIME = 1000 * 60 * 60 * 24 * 30; // days old

export const fetchAllParts = async () => {
  // fetch all parts from db
  if (!parts.length) {
    const q = query(collection(db, 'part_basics'), limit(10000));
    const querySnapshot = await getDocs(q);
    // const querySnapshot = await getDocs(collection(db, 'part_basics'));
    querySnapshot.forEach((doc) => {
      parts.push(doc.data());
    });
  }
};

export const fetchRelatedParts = async (partId = '') => {
  if (!partId) return [null, []];

  // fetch all parts from db
  await fetchAllParts();
  if (!parts) return ['unable to fetch all basic parts', null];

  // create an array of all part names split into words
  if (!splitPartNames.length) {
    splitPartNames = parts
      .filter((p) => p.name) // filter out parts without names
      .map((p) => [p.id, new Set(p.name.split(' '))]);
  }

  // get the part name for the partId
  const part = splitPartNames.filter((p) => p[0] === partId)[0];
  if (!part) return ['unable to find part or part has no name', null];
  const titleWords = part[1];

  const titleSimilarity = [];

  // for every part in catalog
  for (const [otherPartId, otherTitle] of splitPartNames) {
    // find strength of titles relationship
    let titleOverlapStrength = 0;
    for (const word of titleWords) {
      if (otherTitle.has(word)) {
        titleOverlapStrength++;
      }
    }
    // if title overlap strength is greater than 1 & partId is not the same as otherPartId
    titleOverlapStrength > 1 &&
      titleSimilarity.push({
        partId: otherPartId,
        strength: titleOverlapStrength,
      });
  }

  const top10Similar = titleSimilarity
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 50)
    .map((p) => p.partId);

  // console.log('top10Similar', top10Similar);

  //   // save data to json file
  //   const jsonData = JSON.stringify(relations);
  //   fs.writeFileSync(
  //     process.cwd() + `/public/partNameRelationship/group_${index}.json`,
  //     jsonData
  //   );
  // }

  return [null, top10Similar];
};

export const fetchFilteredParts = async (filterText) => {
  await fetchAllParts();
  if (!parts) return ['unable to fetch all basic parts', null];

  const lowercaseFilter = filterText.toLowerCase();
  const filteredParts = parts
    .filter((part) => {
      return part.name?.toLowerCase().includes(lowercaseFilter);
    })
    .slice(0, RESULTS_PER_PAGE)
    .map((part) => part.id);

  return [null, filteredParts];
};
