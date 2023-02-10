import { create } from 'zustand';

const partStore = create((set) => ({
  // isLoading: false,
  // error: null,
  searchResults: { isLoading: false, error: null, data: [] },
  // searchResults: [],
  similarResults: { isLoading: false, error: null, data: [] },
  similarToPartId: null,

  findSimilar: async (partId) => {
    console.log('similar', partId);
    set({ similarResults: { isLoading: true, error: null, data: [] } });
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

  search: async (searchString) => {
    // set({ isLoading: true });
    set({ searchResults: { isLoading: true, error: null, data: [] } });
    console.log('searchParts', searchString);
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
}));

export default partStore;
