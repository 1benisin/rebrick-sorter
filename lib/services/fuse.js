import Fuse from 'fuse.js';

let fuse = null;
const fuseOptions = {
  keys: ['name', 'id', 'catName', 'dimX', 'dimY', 'dimZ', 'weight'],
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
};
const RESULTS_PER_PAGE = 200;

export const fuseSearch = (searchString, includePrints) => {
  // concate "!pat" to search string to exclude prints
  searchString = includePrints ? `pat ${searchString}` : `!pat ${searchString}`;

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
  return filteredParts;
};

export const similarSearch = (partId, includePrints) => {
  console.log(`similarSearch: ${partId}`);
  // find partId in fuse._docs
  const part = fuse._docs.find((part) => part.id === partId);
  if (!part) return [];

  const extraKeys = ['catName', 'dimX', 'dimY', 'dimZ']
    .map((key) => {
      if (part[key]) return { $path: [key], $val: part[key] };
      return null;
    })
    .filter((key) => key);

  // construct a fuse search query with name, id, catId, dimX, dimY, dimZ
  const fuseQuery = {
    $and: [
      {
        $path: ['name'],
        $val: includePrints ? `pat ${part.name}` : `!pat ${part.name}`,
      },
      {
        $path: ['id'],
        $val: part.id,
      },
      ...extraKeys,
    ],
  };

  // use fuse and searchstring to get filtered parts
  let filteredParts = fuse
    .search(fuseQuery)
    .map((result) => ({ ...result.item, searchScore: 1 - result.score }))
    .slice(0, RESULTS_PER_PAGE);
  return filteredParts;
};

const initializeFuse = async () => {
  // fetch parts catalog from local file first then from db if local file is stale
  try {
    // if parts already fetched, return them
    if (fuse) return;

    // if fuse search is not initialized, create it
    console.log('creating fuse');

    // const res = await fetch('/parts_catalog.json');
    const res = await fetch('http://localhost:3000/parts_catalog.json');
    const jsonData = await res.json();
    const allParts = jsonData.parts;
    console.log(`Fetched local ${allParts.length} parts.`);

    fuse = new Fuse(allParts, fuseOptions);

    return;
  } catch (error) {
    console.error(`initializeFuse issue: ${error}`);
    return { error };
  }
};
initializeFuse();
