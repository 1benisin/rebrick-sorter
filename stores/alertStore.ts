// AlertStore.ts
import { create } from "zustand";
import { Alert } from "@/types";

interface AlertState {
  alertList: Alert[];
  addAlert: (Alert: Alert) => void;
  clearAlertList: () => void;
  clearAlertAtTimestamp: (index: number) => void;
}

const CLEAR_ALERT_UPDATE_TIMEOUT = 10000;

export const alertStore = create<AlertState>((set, get) => ({
  alertList: [],
  addAlert: (alert) => {
    set((state) => {
      // set a timeout to clear the alert after 5 seconds if it's not an error
      if (alert.type !== "error") {
        setTimeout(() => {
          get().clearAlertAtTimestamp(alert.timestamp);
        }, CLEAR_ALERT_UPDATE_TIMEOUT);
      }
      const newAlertList = [...state.alertList, alert];
      console.log("newAlertList", newAlertList);
      return { alertList: newAlertList };
    });
  },
  clearAlertList: () => set({ alertList: [] }),
  clearAlertAtTimestamp: (timestamp) => {
    set((state) => {
      const newAlertList = state.alertList.filter(
        (alert) => alert.timestamp !== timestamp
      );
      return { alertList: newAlertList };
    });
  },
}));
