import { async } from '@firebase/util';
import { create } from 'zustand';
import { fuseSearch, similarSearch } from '../services/fuse';

const partStore = create((set, get) => ({
  // search input
  includePrints: false,
  focusedPart: null,
  setFocusedPartId: async (part) => {
    // get part details from backend

    set({ focusedPart: part });
  },
  setIncludePrints: (includePrints) => set({ includePrints }),
  searchString: '',
  setSearchString: async (searchString) => set({ searchString }),
  searchResults: [],

  search: async (searchString = null) => {
    console.log('searchParts', searchString);
    const searchResults = fuseSearch(searchString, get().includePrints);
    console.log('search results', searchResults);
    set({ searchResults });
  },

  findSimilar: async (partId) => {
    const searchResults = similarSearch(partId, get().includePrints);
    set({ searchResults });
    return;
  },
}));

export default partStore;
