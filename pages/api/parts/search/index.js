// QUERY: searchString

import { getParts, RESULTS_PER_PAGE } from '../index';

export default async (req, res) => {
  const { searchString } = req.query;
  console.log('searchString', searchString);

  const parts = await getParts();
  if (!parts) res.status(500).json({ error: 'Unable to fetch parts' });

  const lcSearchString = searchString.toLowerCase();
  const filteredParts = parts
    .filter((part) => {
      return part.name?.toLowerCase().includes(lcSearchString);
    })
    .slice(0, RESULTS_PER_PAGE);

  res.status(200).json(filteredParts);
};
