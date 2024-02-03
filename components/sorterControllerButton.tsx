// sorterControllerButton.jsx
"use client";

import React, { useEffect, useState } from "react";
import SortProcessCtrl from "@/lib/sortProcessCtrl";
import { Button } from "@/components/ui/button";
import { sortProcessStore } from "@/stores/sortProcessStore";

const SortProcessCtrlButton = () => {
  const [localSortProcessCtrl, setLocalSortProcessCtrl] =
    useState<SortProcessCtrl | null>(null);
  const { isRunning } = sortProcessStore();

  useEffect(() => {
    const controller = SortProcessCtrl.getInstance();
    setLocalSortProcessCtrl(controller);
  }, []);

  const handleStartStop = () => {
    if (!localSortProcessCtrl) {
      return;
    }
    if (isRunning) {
      localSortProcessCtrl.stop();
    } else {
      localSortProcessCtrl.start();
    }
  };

  return (
    <Button
      onClick={handleStartStop}
      className={`px-4 py-2 font-bold text-white rounded 
      ${
        isRunning
          ? "bg-red-500 hover:bg-red-700"
          : "bg-green-500 hover:bg-green-700"
      }`}
    >
      {isRunning ? "Stop" : "Start"}
    </Button>
  );
};

export default SortProcessCtrlButton;
