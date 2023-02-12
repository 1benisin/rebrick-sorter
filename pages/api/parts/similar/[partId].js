import { getParts, RESULTS_PER_PAGE, checkPartsFreshness } from '../index';

let partsWithSplitNames = [];

export default async (req, res) => {
  const { partId: similarToPartId } = req.query;
  console.log('-finding similar parts to part', similarToPartId);

  const PARTS = await getParts();
  if (!PARTS) res.status(500).json({ error: 'Unable to fetch parts' });

  // create an array of all part names split into words
  if (!partsWithSplitNames.length) {
    partsWithSplitNames = PARTS.filter((p) => p.name) // filter out parts without names
      .map((p) => ({ ...p, splitName: new Set(p.name.split(' ')) }));
  }
  console.log('-splitPartNames', partsWithSplitNames.slice(0, 2));

  // get the part name for the similarToPartId
  const similarToPart = partsWithSplitNames.find((p) => p.id === similarToPartId);
  if (!similarToPart) res.status(500).json({ error: 'unable to find part or part has no name' });

  const partsWithTitleSimilarity = [];

  // for every part in catalog
  for (const splitNamePart of partsWithSplitNames) {
    // find strength of titles relationship
    let titleOverlapStrength = 0;
    for (const word of similarToPart.splitName) {
      if (splitNamePart.splitName.has(word)) titleOverlapStrength++;
    }
    // if title overlap strength is greater than 1 & partId is not the same as otherPartId
    titleOverlapStrength > 1 &&
      partsWithTitleSimilarity.push({
        ...splitNamePart,
        similarity: titleOverlapStrength,
      });
  }

  let mostSimilarParts = partsWithTitleSimilarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, RESULTS_PER_PAGE)
    .map((p) => {
      delete p.splitName;
      delete p.similarity;
      return p;
    });

  mostSimilarParts = await checkPartsFreshness(mostSimilarParts);

  if (mostSimilarParts?.error) res.status(500).json({ error: mostSimilarParts.error });

  res.status(200).json(mostSimilarParts);
};
