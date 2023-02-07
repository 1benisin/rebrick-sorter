// QUERY: searchString

import { getParts, checkPartsFreshness, RESULTS_PER_PAGE } from '../index';

export default async (req, res) => {
  const { searchString } = req.query;
  console.log('searchString', searchString);

  const parts = await getParts();
  // console.log('searchparts', parts.slice(0, 2));

  if (!parts) res.status(500).json({ error: 'Unable to fetch parts' });

  const lcSearchString = searchString.toLowerCase();
  const filteredParts = parts
    .filter((part) => {
      return part.partName?.toLowerCase().includes(lcSearchString);
    })
    .slice(0, RESULTS_PER_PAGE);

  // const partsObject = convertPartsArrayToObject(filteredParts);

  const freshParts = await checkPartsFreshness(filteredParts);
  // const freshParts = filteredParts;

  // console.log('searchparts fresh', freshParts.slice(0, 2));
  res.status(200).json(freshParts);
};
