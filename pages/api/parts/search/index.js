import Fuse from 'fuse.js';
import { getFuseSearch, refreshParts, RESULTS_PER_PAGE } from '../index';

let fuse = null;

export default async (req, res) => {
  try {
    let { searchString, includePrints } = req.query;
    // converts "true" to true
    includePrints = includePrints === 'true';
    const fuse = await getFuseSearch();

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
