// stores/sortProcessStore.ts

// sortProcessStore.ts
import { create } from 'zustand';
import { DetectionPairGroup, DetectionPair } from '@/types/detectionPairs';

const MAX_DETECTION_GROUPS = 10;

export type SortProcessState = {
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  // ---
  detectionPairGroups: DetectionPairGroup[];
  addDetectionPairGroup: (detectionPairGroup: DetectionPairGroup) => void;
  updateDetectionPairGroupValue: <K extends keyof DetectionPairGroup>(
    id: string,
    key: K,
    value: DetectionPairGroup[K],
  ) => void;
  addDetectionPairToGroup: (groupId: string, detectionPair: DetectionPair) => void;

  // ---
  videoCaptureDimensions: { width: number; height: number };
  setVideoCaptureDimensions: (width: number, height: number) => void;
  videoStreamId: string;
  setVideoStreamId: (id: string) => void;
  videoStreamId2: string;
  setVideoStreamId2: (id: string) => void;

  // ---
  conveyorSpeed: number;
  conveyorSpeedLog: { time: number; speed: number }[];
  setConveyorSpeed: (speed: number) => void;

  ppmCount: number;
  ppmTimestamps: number[];

  // ---
  serialPorts: string[];
  setSerialPorts: (ports: string[]) => void;

  // ---
  handleJetFired: () => void;
};

export const sortProcessStore = create<SortProcessState>((set) => ({
  isRunning: false,
  setIsRunning: (isRunning: boolean) => set({ isRunning }),
  // ---
  detectionPairGroups: [],
  addDetectionPairGroup: (detectionPairGroup: DetectionPairGroup) =>
    set((state) => ({
      detectionPairGroups: [detectionPairGroup, ...state.detectionPairGroups].slice(0, MAX_DETECTION_GROUPS),
    })),
  updateDetectionPairGroupValue: <K extends keyof DetectionPairGroup>(
    id: string,
    key: K,
    value: DetectionPairGroup[K],
  ) => {
    set((state) => {
      const groups = state.detectionPairGroups;
      // find the group with the given id
      const index = groups.findIndex((g) => g.id === id);
      if (index === -1) return state; // If no matching group is found, return the current state

      // Clone the matching group and update the specified key with the given value
      const updatedGroup = { ...groups[index], [key]: value };

      // Create a new array for detectionPairGroups with the updated group
      const updatedGroups = [...groups.slice(0, index), updatedGroup, ...groups.slice(index + 1)];

      return { detectionPairGroups: [...updatedGroups] };
    });
  },
  addDetectionPairToGroup: (groupId: string, detectionPair: DetectionPair) =>
    set((state) => {
      const groups = state.detectionPairGroups;
      // find the group with the given id
      const matchingGroup = groups.find((g) => g.id === groupId);
      if (matchingGroup) {
        matchingGroup.detectionPairs.push(detectionPair);
      }
      return { detectionPairGroups: [...groups] };
    }),

  // ---
  videoCaptureDimensions: { width: 0, height: 0 },
  setVideoCaptureDimensions: (width: number, height: number) => set({ videoCaptureDimensions: { width, height } }),
  videoStreamId: '',
  setVideoStreamId: (id: string) => set({ videoStreamId: id }),
  videoStreamId2: '',
  setVideoStreamId2: (id: string) => set({ videoStreamId2: id }),

  // ---
  conveyorSpeed: 0,
  conveyorSpeedLog: [],
  setConveyorSpeed: (speed: number) => {
    set((state) => {
      const now = Date.now();
      const speedLog = [...state.conveyorSpeedLog, { time: now, speed }].filter((log) => now - log.time < 60 * 1000);
      return { conveyorSpeed: speed, conveyorSpeedLog: speedLog };
    });
  },
  // ---
  ppmCount: 0,
  ppmTimestamps: [],

  // ---
  serialPorts: [],
  setSerialPorts: (ports: string[]) => set({ serialPorts: ports }),

  // --- handleJetFired - calculate ppm count
  handleJetFired: () => {
    set((state) => {
      const timestamps = state.ppmTimestamps;
      const now = Date.now();
      // keep the last 10 min of timestamps
      const updatedTimestamps = [now, ...timestamps].filter((ts) => now - ts < 10 * 60 * 1000);
      const ppmCount =
        updatedTimestamps.length > 1
          ? (updatedTimestamps.length - 1) / ((now - updatedTimestamps[updatedTimestamps.length - 1]) / 60000)
          : 0;

      return { ppmCount: Math.round(ppmCount), ppmTimestamps: updatedTimestamps };
    });
  },
}));
