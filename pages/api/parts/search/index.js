import Fuse from 'fuse.js';
import { getParts, refreshParts, RESULTS_PER_PAGE } from '../index';

let fuse = null;

export default async (req, res) => {
  try {
    let { searchString, includePrints } = req.query;
    // converts "true" to true
    includePrints = includePrints === 'true';

    console.log('searchString', searchString);
    console.log('includePrints', includePrints);

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

    // console.log('fuse', Object.keys(fuse));
    // console.log('fuse', fuse._docs);

    // concate "!pat" to search string to exclude prints
    searchString = includePrints ? `pat ${searchString}` : `!pat ${searchString}`;
    // console.log('searchString --- ', searchString);

    // construct a fuse search query
    const fuseQuery = {
      $and: [
        {
          $path: ['name'],
          $val: searchString,
        },
      ],
    };

    // use fuse and searchstring to get filtered parts
    let filteredParts = fuse
      .search(fuseQuery)
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
