"use client";

import Camera from "@/components/video";
import SorterControllerButton from "@/components/sorterControllerButton";
import ErrorDisplay from "@/components/ErrorDisplay";
import DetectionImageRow from "@/components/DetectionImageRow";

const SortPage = () => {
  return (
    <div>
      <h1>Sorter</h1>
      <div className="px-4 lg:px-8">
        <ErrorDisplay />
        <Camera />
        <div className="flex justify-center mt-4">
          <SorterControllerButton />
        </div>

        <DetectionImageRow />
      </div>
    </div>
  );
};

export default SortPage;
