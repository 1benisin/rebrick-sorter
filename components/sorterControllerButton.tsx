// sorterControllerButton.jsx
"use client";

import React, { useEffect, useState } from "react";
import SorterController from "@/lib/sortProcessController";
import { Button } from "@/components/ui/button";
import { sortProcessStore } from "@/stores/sortProcessStore";

const SorterControllerButton = () => {
  const [sorterController, setSorterController] =
    useState<SorterController | null>(null);
  const { isRunning } = sortProcessStore();

  useEffect(() => {
    const controller = SorterController.getInstance();
    setSorterController(controller);
  }, []);

  const handleStartStop = () => {
    if (!sorterController) {
      return;
    }
    if (isRunning) {
      sorterController.stop();
    } else {
      sorterController.start();
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

export default SorterControllerButton;
