// DetectionDisplay.jsx

import React from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { DetectionPairGroup } from '@/types/detectionPairs.type';
import { v4 as uuid } from 'uuid';

const DetectionPairDisplay = () => {
  const detectionPairGroups = sortProcessStore((state) => state.detectionPairGroups);

  return (
    <>
      {/* <Button onClick={}>Clear Detections</Button> */}
      <div onClick={() => console.log(detectionPairGroups)}>
        {detectionPairGroups.map((group) => (
          <DetectionRow key={group.id} group={group} />
        ))}
      </div>
    </>
  );
};

const DetectionRow = ({ group }: { group: DetectionPairGroup }) => {
  const topClassification = group.combineclassification ? group.combineclassification[0] : undefined;

  return (
    <div className={`flex`}>
      <div className={`mb-1 p-1 border border-gray-200 rounded-lg ${group.offScreen == true ? 'border-2 border-red-500 text-gray-400' : ''}`}>
        <div className="flex items-center">
          {/* Display detections */}
          <div className="flex flex-row" onClick={() => console.log('Detection Pairs: ', group.detectionPairs)}>
            {group.detectionPairs.map((pair, index) => (
              <div key={uuid()} className="flex flex-col items-center">
                <div className="flex items-center">
                  {pair[0].imageURI ? (
                    <img
                      src={pair[0].imageURI}
                      alt={`Pair Image Top ${index}`}
                      className={
                        group.indexUsedToClassify != undefined && group.indexUsedToClassify === index
                          ? 'w-12 h-12 border border-red-500 rounded-md'
                          : 'w-12 h-12 rounded-md'
                      }
                    />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center border border-gray-300 rounded-md">No Image</div>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  {pair[1].imageURI ? (
                    <img
                      src={pair[1].imageURI}
                      alt={`Pair Image Side ${index}`}
                      className={
                        group.indexUsedToClassify != undefined && group.indexUsedToClassify === index
                          ? 'w-12 h-12 border border-red-500 rounded-md'
                          : 'w-12 h-12 rounded-md'
                      }
                    />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center border border-gray-300 rounded-md">No Image</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Display classification top item info if available */}
          {topClassification && (
            <>
              <img src={topClassification.img_url} alt={topClassification.name} className="w-16 h-16" />
              <div>
                <div className="font-bold">{topClassification.name}</div>
                <div className="text-sm">Score: {`${(100 * topClassification.score).toFixed(0)}%`}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetectionPairDisplay;
