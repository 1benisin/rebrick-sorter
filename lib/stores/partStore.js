import { async } from '@firebase/util';
import { create } from 'zustand';
import { fuseSearch, similarSearch } from '../services/fuse';

const partStore = create((set, get) => ({
  // search input
  includePrints: false,
  setIncludePrints: (includePrints) => set({ includePrints }),
  searchString: '',
  setSearchString: async (searchString) => set({ searchString }),

  // search results
  searchResults: [],

  search: async (searchString = null) => {
    console.log('searchParts', searchString);
    // reset state
    set({
      similarResults: { isLoading: false, error: null, data: [] },
      similarToPartId: null,
    });
    const searchResults = fuseSearch(searchString, get().includePrints);
    console.log('search results', searchResults);
    set({ searchResults });
  },

  similarResults: { isLoading: false, error: null, data: [] },
  similarToPartId: null,

  findSimilar: async (partId) => {
    const searchResults = similarSearch(partId, get().includePrints);

    set({ searchResults });
    return;
    // if search results is still loading, return
    if (get().similarResults.isLoading) {
      console.log('Previous similar search is still loading...');
      return;
    }

    console.log('similar', partId);
    set({ similarResults: { isLoading: true, error: null, data: [] }, similarToPartId: partId });
    const res = await fetch('/api/parts/similar/' + partId);
    const data = await res.json();

    if (res.status !== 200) {
      set({ similarResults: { isLoading: false, error: data, data: [] } });
      console.warn(data);
    }

    console.log('similar results', data);
    set({ similarResults: { isLoading: false, error: null, data } });
  },
}));

export default partStore;
