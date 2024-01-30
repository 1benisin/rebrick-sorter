// sorter-controller-button.jsx
"use client";

import React, { useEffect, useState } from "react";
import SorterController, { SorterEvent } from "@/lib/sorter-controller";
import { Button } from "@/components/ui/button";

const SorterControllerButton = () => {
  const [sorterController, setSorterController] =
    useState<SorterController | null>(null);
  const [isSorting, setIsSorting] = useState(false);

  useEffect(() => {
    const controller = SorterController.getInstance();
    setSorterController(controller);
    // Sync the state when the component mounts in case the SorterController is already running
    setIsSorting(controller.isProcessRunning());

    const handleStop = () => {
      setIsSorting(false);
      console.log("SorterControllerButton: Sorter stopped");
    };
    const handleStart = () => {
      setIsSorting(true);
      console.log("SorterControllerButton: Sorter started");
    };

    controller.subscribe(SorterEvent.START, handleStart);
    controller.subscribe(SorterEvent.STOP, handleStop);

    // Cleanup function
    return () => {
      controller.unsubscribe(SorterEvent.START, handleStart);
      controller.unsubscribe(SorterEvent.STOP, handleStop);
    };
  }, []);

  const handleStartStop = () => {
    if (!sorterController) {
      return;
    }
    if (isSorting) {
      sorterController.stop();
    } else {
      sorterController.start();
    }
    setIsSorting(!isSorting);
  };

  return (
    <Button
      onClick={handleStartStop}
      className={`px-4 py-2 font-bold text-white rounded 
      ${
        isSorting
          ? "bg-red-500 hover:bg-red-700"
          : "bg-green-500 hover:bg-green-700"
      }`}
    >
      {isSorting ? "Stop" : "Start"}
    </Button>
  );
};

export default SorterControllerButton;
