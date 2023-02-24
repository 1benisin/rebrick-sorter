import { getParts, RESULTS_PER_PAGE, refreshParts } from '../index';

let allPartsPhrases = new Map();

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
      PARTS.filter((p) => p.name) // filter out parts without names
        .forEach((p) => {
          const words = p.name.split(' ');
          const phrases = words.flatMap((_, i) =>
            Array.from({ length: words.length - i }, (_, j) => words.slice(j, j + i + 1).join(' '))
          );
          allPartsPhrases.set(p.id, new Set(phrases));
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
      let phraseOverlapStrength = 0;
      for (const phrase of targetPhrases) {
        if (comparePhrases.has(phrase)) phraseOverlapStrength += 2;
      }
      // find negative strength of phrase relationship
      for (const phrase of comparePhrases) {
        if (!targetPhrases.has(phrase)) phraseOverlapStrength--;
      }

      // if phrase overlap strength is greater than 1
      phraseOverlapStrength > 1 &&
        partsWithPhraseSimilarity.push({
          id: compareId,
          similarity: phraseOverlapStrength,
        });
    }

    let mostSimilarParts = partsWithPhraseSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, RESULTS_PER_PAGE)
      .map((p) => {
        const part = PARTS.find((part) => part.id === p.id);
        return { ...part, similarity: p.similarity };
      });

    mostSimilarParts = await refreshParts(mostSimilarParts);

    res.status(200).json(mostSimilarParts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
