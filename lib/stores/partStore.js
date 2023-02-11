import { async } from '@firebase/util';
import { create } from 'zustand';

const partStore = create((set, get) => ({
  // search input
  searchString: '',
  setSearchString: async (searchString) => set({ searchString }),

  // search results
  searchResults: { isLoading: false, error: null, data: [] },
  search: async (string = null) => {
    // if search is being called with a new searchString, update the searchString
    if (string) set({ searchString: string });
    // if search is being called without a searchString, use the current searchString
    const searchString = !string ? get().searchString : string;

    console.log('searchParts', searchString);
    // reset state
    set({
      searchResults: { isLoading: true, error: null, data: [] },
      similarResults: { isLoading: false, error: null, data: [] },
      similarToPartId: null,
    });
    // api call
    const res = await fetch('/api/parts/search?' + new URLSearchParams({ searchString }));
    const data = await res.json();

    if (res.status !== 200) {
      // set({ isLoading: false, error: data });
      set({ searchResults: { isLoading: false, error: data, data: [] } });
      console.warn(data);
      throw new Error(data);
    }

    console.log('search results', data);
    // set({ searchResults: data, isLoading: false });
    set({ searchResults: { isLoading: false, error: null, data } });
  },

  similarResults: { isLoading: false, error: null, data: [] },
  similarToPartId: null,
  findSimilar: async (partId) => {
    console.log('similar', partId);
    set({ similarResults: { isLoading: true, error: null, data: [] }, similarToPartId: partId });
    const res = await fetch('/api/parts/similar/' + partId);
    const data = await res.json();

    if (res.status !== 200) {
      set({ similarResults: { isLoading: false, error: data, data: [] } });
      console.warn(data);
      throw new Error(data);
    }

    console.log('similar results', data);
    set({ similarResults: { isLoading: false, error: null, data } });
  },
}));

export default partStore;
