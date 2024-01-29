// sorter-controller-button.jsx
import React, { useEffect, useState } from "react";
import SorterController, { SorterEvent } from "@/lib/sorter-controller";
import { Button } from "@/components/ui/button";

const SorterControllerButton = () => {
  const sorterController = SorterController.getInstance();
  const [isSorting, setIsSorting] = useState(
    sorterController.isProcessRunning()
  );

  useEffect(() => {
    // Sync the state when the component mounts in case the SorterController is already running
    setIsSorting(sorterController.isProcessRunning());

    const handleStop = () => {
      setIsSorting(false);
      console.log("SorterControllerButton: Sorter stopped");
    };
    const handleStart = () => {
      setIsSorting(true);
      console.log("SorterControllerButton: Sorter started");
    };

    sorterController.subscribe(SorterEvent.START, handleStart);
    sorterController.subscribe(SorterEvent.STOP, handleStop);

    // Cleanup function
    return () => {
      sorterController.unsubscribe(SorterEvent.START, handleStart);
      sorterController.unsubscribe(SorterEvent.STOP, handleStop);
    };
  }, []);

  const handleStartStop = () => {
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
