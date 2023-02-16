import { create } from 'zustand';

const applicationStore = create((set, get) => ({
  sidebarPart: null,
  partSidebarOpen: false,
  togglePartSidebar: (part = null) => {
    // toggle the sidebar and set the part
    set({ partSidebarOpen: !get().partSidebarOpen, sidebarPart: part });
  },
}));

export default applicationStore;
