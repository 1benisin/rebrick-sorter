import { exp } from '@tensorflow/tfjs-core';
import { create } from 'zustand';

const mediaStore = create((set) => ({
  videoRef: null,
  canvasRef: null,
  setVideoRef: (ref) => set({ videoRef: ref }),
  setCanvasRef: (ref) => set({ canvasRef: ref }),
}));

export default mediaStore;
