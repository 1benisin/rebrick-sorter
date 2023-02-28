import { getParts, RESULTS_PER_PAGE, refreshParts } from '../index';

let allPartsPhrases = new Map();
let allPartSizes = new Map();

// ------------------- HELPERS -------------------
function extractSizeFromTitle(title) {
  const regex = /(\d+(?: \d+)?\/?\d*) x (\d+(?: \d+)?\/?\d*)(?: x (\d+(?: \d+)?\/?\d*))?/; // matches "1/2" or "2/3" or "1 2/3"
  const match = title.match(regex);
  if (match) {
    return match[0];
  }
  return null;
}

// ------------------- GET SIMILAR PARTS -------------------
export default async (req, res) => {
  try {
    const { partId: targetPartId } = req.query;
    console.log('-finding similar parts to part', targetPartId);

    const PARTS = await getParts();
    if (!PARTS) res.status(500).json({ error: 'Unable to fetch parts' });

    // create a map of part phrases
    if (!allPartsPhrases.size) {
      console.log('creating part phrases map');
      // if part has a name and name does not include "pattern"
      PARTS.filter((p) => p.name && !p.name.toLowerCase().includes('pattern')).forEach((p) => {
        const words = p.name.split(' ');
        // const phrases = words.flatMap((_, i) =>
        //   Array.from({ length: words.length - i }, (_, j) => words.slice(j, j + i + 1).join(' '))
        // );
        allPartsPhrases.set(p.id, new Set(words));
        const partSize = extractSizeFromTitle(p.name);
        if (partSize) allPartSizes.set(p.id, partSize);
      });
    }

    // get the part phrases for the targetPartId
    const targetPhrases = allPartsPhrases.get(targetPartId);
    if (!targetPhrases) res.status(500).json({ error: 'unable to find part or part has no name' });

    const partsWithPhraseSimilarity = [];

    // for every part in catalog
    for (const [compareId, comparePhrases] of allPartsPhrases) {
      if (compareId === targetPartId) continue; // skip the targetPhrases

      // find positive strength of phrase relationship
      let similarity = 0;
      for (const phrase of targetPhrases) {
        if (comparePhrases.has(phrase)) {
          // find the longer phrase length
          const potentialStrength = Math.max(targetPhrases.size, comparePhrases.size);
          similarity += 1 / potentialStrength;
        }
      }

      // find if sizes are similar
      const targetSize = allPartSizes.get(targetPartId);
      const compareSize = allPartSizes.get(compareId);
      if (targetSize && compareSize && targetSize === compareSize) similarity += 1;

      // // find negative strength of phrase relationship
      // for (const phrase of comparePhrases) {
      //   if (!targetPhrases.has(phrase)) similarity--;
      // }

      // if phrase overlap strength is greater than 1
      similarity > 0.1 &&
        partsWithPhraseSimilarity.push({
          id: compareId,
          similarity,
        });
    }

    let mostSimilarParts = partsWithPhraseSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, RESULTS_PER_PAGE)
      .map((p) => {
        const part = PARTS.find((part) => part.id === p.id);
        return { ...part, searchScore: p.similarity };
      });

    mostSimilarParts = await refreshParts(mostSimilarParts);

    res.status(200).json(mostSimilarParts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
