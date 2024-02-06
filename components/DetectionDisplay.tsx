// DetectionDisplay.jsx

import React from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { settingsStore } from '@/stores/settingsStore';
import { DetectionGroup, BrickognizeResponse } from '@/types'; // Assuming these types are defined in your project
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

const DetectionRow = ({ group }: { group: DetectionGroup }) => {
  const { conveyorSpeed_PPS } = settingsStore();
  // Assuming the top item is the first one in the array
  const topItem = group.classification?.items[0];

  const findAverageDistanceBetweenDetections = (group: DetectionGroup) => {
    if (group.detections.length < 2) {
      return 0;
    }

    let totalDistance = 0;
    for (let i = 0; i < group.detections.length - 1; i++) {
      const detection1 = group.detections[i];
      const detection2 = group.detections[i + 1];
      // find the predicted detection1 centroid position at detection2 time using conveyor speed
      const timeDiff = (detection2.timestamp - detection1.timestamp) / 1000; // convert to seconds (ms to s
      const distanceTravelled = conveyorSpeed_PPS * timeDiff;
      const distance = Math.abs(detection2.centroid.x - (detection1.centroid.x + distanceTravelled));

      totalDistance += distance;
    }
    console.log('Average distance between matched detections ', totalDistance / (group.detections.length - 1));
  };

  return (
    <div className={`flex flex-cel`} onClick={() => findAverageDistanceBetweenDetections(group)}>
      <div className={`mb-1 p-1 border border-gray-200 rounded-lg ${group.offScreen == true ? 'border-2 border-red-500 text-gray-400' : ''}`}>
        <div className="flex items-center space-x-2">
          {/* Display detections */}
          <div className="flex flex-row">
            {group.detections.map((detection, index) => (
              <div key={index} className="mx-1 flex items-center">
                {detection.imageURI ? (
                  <img
                    src={detection.imageURI}
                    alt={`Detection ${index}`}
                    className={
                      group.indexUsedToClassify != undefined && group.indexUsedToClassify === index
                        ? 'w-16 h-16 border border-red-500 rounded-md'
                        : 'w-12 h-12 rounded-md'
                    }
                  />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center border border-gray-300">No Image</div>
                )}
              </div>
            ))}
          </div>
          {/* Display classification top item info if available */}
          {topItem && (
            <>
              <img src={topItem.img_url} alt={topItem.name} className="w-16 h-16" />
              <div>
                <div className="font-bold">{topItem.name}</div>
                <div className="text-sm">Score: {`${(100 * topItem.score).toFixed(0)}%`}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetectionDisplay;
