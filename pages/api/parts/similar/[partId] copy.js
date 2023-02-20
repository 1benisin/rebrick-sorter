import { getParts, RESULTS_PER_PAGE, refreshParts } from '../index';

let partsPhrases = [];

export default async (req, res) => {
  try {
    const { partId: similarToPartId } = req.query;
    console.log('-finding similar parts to part', similarToPartId);

    const PARTS = await getParts();
    if (!PARTS) res.status(500).json({ error: 'Unable to fetch parts' });

    // create an array of all part names split into phrases
    if (!partsPhrases.length) {
      partsPhrases = PARTS.filter((p) => p.name) // filter out parts without names
        .map((p) => {
          const words = p.name.split(' ');
          const phrases = words.flatMap((_, i) =>
            Array.from({ length: words.length - i }, (_, j) => words.slice(j, j + i + 1).join(' '))
          );
          return { id: p.id, phrases: new Set(phrases) };
        });
    }

    // get the part phrases for the similarToPartId
    const similarToPart = partsPhrases.find((p) => p.id === similarToPartId);
    if (!similarToPart) res.status(500).json({ error: 'unable to find part or part has no name' });

    const partsWithPhraseSimilarity = [];

    // for every part in catalog
    for (const comparePart of partsPhrases) {
      // find strength of phrases relationship
      let phraseOverlapStrength = 0;
      for (const phrase of similarToPart.phrases) {
        if (comparePart.phrases.has(phrase)) phraseOverlapStrength++;
      }

      // if phrase overlap strength is greater than 1 & partId is not the same as otherPartId
      phraseOverlapStrength > 1 &&
        partsWithPhraseSimilarity.push({
          id: comparePart.id,
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
