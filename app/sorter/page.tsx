"use client";

import Camera from "@/components/video";
import SorterControllerButton from "@/components/sorterControllerButton";
import ErrorDisplay from "@/components/errorDisplay";
import { sortProcessStore } from "@/stores/sortProcessStore";

const SortPage = () => {
  const detectionImageURIs = sortProcessStore(
    (state) => state.detectionImageURIs
  );

  return (
    <div>
      <h1>Sorter</h1>
      <div className="px-4 lg:px-8">
        <ErrorDisplay />
        <Camera />
        <div className="flex justify-center mt-4">
          <SorterControllerButton />
        </div>
        <div className="flex overflow-x-auto">
          {detectionImageURIs.map((uri, index) => (
            <img
              key={index}
              src={uri}
              alt={`Image ${index}`}
              className="w-12 h-12 object-cover mr-2" // Tailwind classes for size and margin
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SortPage;
