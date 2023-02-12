import { create } from 'zustand';

const applicationStore = create((set, get) => ({
  sidebarPartId: null,
  partSidebarOpen: false,
  togglePartSidebar: (partId = null) => {
    // toggle the sidebar and set the partId
    set({ partSidebarOpen: !get().partSidebarOpen, sidebarPartId: partId });
  },
}));

export default applicationStore;
