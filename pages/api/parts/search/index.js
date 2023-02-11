// QUERY: searchString
import Fuse from 'fuse.js';
import { getParts, checkPartsFreshness, RESULTS_PER_PAGE } from '../index';

let fuse = null;

export default async (req, res) => {
  const { searchString } = req.query;
  console.log('searchString', searchString);

  if (!fuse) {
    console.log('creating fuse');
    const PARTS = await getParts();
    if (!PARTS) res.status(500).json({ error: 'Unable to fetch parts' });

    fuse = new Fuse(PARTS, {
      keys: ['name', 'id', 'category_name'],
      // isCaseSensitive: false,
      includeScore: true,
      shouldSort: true,
      // includeMatches: false,
      findAllMatches: true,
      // location: 0,
      // threshold: 0.6,
      // distance: 100,
      useExtendedSearch: true,
      ignoreLocation: true,
      // ignoreFieldNorm: false,
      // fieldNormWeight: 1,
    });
  }

  // use fuse and searchstring to get filtered parts
  let filteredParts = fuse
    .search(searchString)
    .map((result) => ({ ...result.item, searchScore: 1 - result.score }))
    .slice(0, RESULTS_PER_PAGE);
  console.log('filteredParts', filteredParts.slice(0, 2));

  filteredParts = await checkPartsFreshness(filteredParts);

  if (filteredParts?.error) res.status(500).json({ error: filteredParts.error });

  res.status(200).json(filteredParts);
};

// export default async (req, res) => {
//   const { searchString } = req.query;
//   console.log('searchString', searchString);

//   const PARTS = await getParts();
//   // console.log('searchparts', parts.slice(0, 2));

//   if (!PARTS) res.status(500).json({ error: 'Unable to fetch parts' });

//   const lcSearchString = searchString.toLowerCase();
//   const filteredParts = PARTS.filter((part) => {
//     return part.name?.toLowerCase().includes(lcSearchString);
//   }).slice(0, RESULTS_PER_PAGE);

//   // const partsObject = convertPartsArrayToObject(filteredParts);

//   const freshParts = await checkPartsFreshness(filteredParts);

//   if (freshParts?.error) res.status(500).json({ error: freshParts.error });

//   // console.log('searchparts fresh', freshParts.slice(0, 2));
//   res.status(200).json(freshParts);
// };
