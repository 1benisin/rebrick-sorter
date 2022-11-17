import create from 'zustand';

export const useGeneralStore = create((set, get) => ({
  searchFilter: '',
  setSearchFilter: (value) => set({ searchFilter: value }),

  videoRef: null,
  setVideoRef: (value) => set({ videoRef: value }),

  canvasRef: null,
  setCanvasRef: (value) => set({ canvasRef: value }),

  sideBarOpen: false,
  setSideBarOpen: (value) => set({ sideBarOpen: value }),

  sideBarPartId: '',
  setSideBarPartId: (value) => set({ sideBarPartId: value }),

  //   fetch: async (pond) => {
  //     const response = await fetch(pond);
  //     set({ fishies: await response.json() });
  //   },
}));
