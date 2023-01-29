import { create } from 'zustand';

const MediaStore = create((set) => ({
  videoRef: null,
  canvasRef: null,
  setVideoRef: (ref) => set({ videoRef: ref }),
  setCanvasRef: (ref) => set({ canvasRef: ref }),
}));
