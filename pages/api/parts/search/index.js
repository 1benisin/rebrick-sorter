import Fuse from 'fuse.js';
import { getParts, refreshParts, RESULTS_PER_PAGE } from '../index';

let fuse = null;

export default async (req, res) => {
  try {
    const { searchString } = req.query;
    console.log('searchString', searchString);

    // if fuse search is not initialized, create it
    if (!fuse) {
      console.log('creating fuse');
      const PARTS = await getParts();

      fuse = new Fuse(PARTS, {
        keys: ['name', 'id', 'catName'],
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

    filteredParts = await refreshParts(filteredParts);

    if (filteredParts?.error)
      res.status(500).json(`Unable to refreshParts: ${filteredParts.error}`);

    res.status(200).json(filteredParts);
  } catch (error) {
    res.status(500).json(`Unable to search parts: ${error}`);
  }
};
