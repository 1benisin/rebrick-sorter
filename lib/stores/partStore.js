import { create } from 'zustand';

const partStore = create((set) => ({
  parts: [],
  searchParts: async (searchString) => {
    console.log('searchParts', searchString);
    const res = await fetch('/api/parts/search?' + new URLSearchParams({ searchString }));
    const data = await res.json();

    if (res.status !== 200) {
      console.warn(data);
      throw new Error(data);
    }

    console.log(data);
    set({ parts: data });
  },
}));
// partStore.getState().searchParts('hair');

export default partStore;
