// DetectionDisplay.jsx

import React from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { Detection } from '@/types';
import { Button } from '@/components/ui/button';

const IMAGE_SIZE = 50; // Width and height of each image in pixels

const DetectionDisplay = () => {
  const topViewDetectGroups = sortProcessStore((state) => state.topViewDetectGroups);
  const clearDetectionGroups = sortProcessStore((state) => state.clearDetectionGroups);

  return (
    <>
      <Button onClick={clearDetectionGroups}>Clear Detections</Button>
      <div onClick={() => console.log(topViewDetectGroups)}>
        {topViewDetectGroups.map((group, index) => (
          <DetectionRow key={index} group={group} />
        ))}
      </div>
    </>
  );
};

const DetectionRow = ({ group }: { group: Detection[] }) => {
  return (
    <div className="flex flex-row my-2">
      {group.map((detection, index) => (
        <div key={index} className="mx-1 flexitems-center">
          {detection.imageURI ? (
            <img src={detection.imageURI} alt={`Detection ${index}`} className="w-12 h-12" />
          ) : (
            <div className="w-12 h-12 flex items-center justify-center border border-gray-300">No Image</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default DetectionDisplay;
