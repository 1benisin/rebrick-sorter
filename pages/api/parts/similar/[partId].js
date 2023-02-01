import { getParts, RESULTS_PER_PAGE } from '../index';

let splitPartNames = [];

export default async (req, res) => {
  const { partId } = req.query;
  console.log('partId', partId);

  const parts = await getParts();
  if (!parts) res.status(500).json({ error: 'Unable to fetch parts' });

  // create an array of all part names split into words
  if (!splitPartNames.length) {
    splitPartNames = parts
      .filter((p) => p.name) // filter out parts without names
      .map((p) => ({ partId: p.id, splitName: new Set(p.name.split(' ')) }));
  }

  // get the part name for the partId
  const part = splitPartNames.filter((p) => p.partId === partId)[0];
  if (!part) res.status(500).json({ error: 'unable to find part or part has no name' });

  const titleSimilarity = [];

  // for every part in catalog
  for (const { partId, splitName } of splitPartNames) {
    // find strength of titles relationship
    let titleOverlapStrength = 0;
    for (const word of part.splitName) {
      if (splitName.has(word)) titleOverlapStrength++;
    }
    // if title overlap strength is greater than 1 & partId is not the same as otherPartId
    titleOverlapStrength > 1 &&
      titleSimilarity.push({
        partId,
        strength: titleOverlapStrength,
      });
  }

  const mostSimilarParts = titleSimilarity
    .sort((a, b) => b.strength - a.strength)
    .slice(0, RESULTS_PER_PAGE)
    // map partId to matching part id in parts and return part
    .map((p) => parts.filter((part) => part.id === p.partId)[0]);

  res.status(200).json(mostSimilarParts);
};
