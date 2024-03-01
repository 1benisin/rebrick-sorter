// DetectionDisplay.jsx

import React from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { DetectionPairGroup } from '@/types/detectionPairs';
import { v4 as uuid } from 'uuid';
import { Badge } from '@/components/ui/badge';

const DetectionPairDisplay = () => {
  const detectionPairGroups = sortProcessStore((state) => state.detectionPairGroups);

  return (
    <>
      <div className={`flex`} onClick={() => console.log(detectionPairGroups)}>
        {detectionPairGroups.map((group) => (
          <DetectionRow key={group.id} group={group} />
        ))}
      </div>
    </>
  );
};

const DetectionRow = ({ group }: { group: DetectionPairGroup }) => {
  const classification = group.classificationResult || undefined;

  return (
    <div
      className={`flex flex-col items-center mr-1 p-1 w-28 min-w-28 border rounded-lg ${group.offScreen == true ? ' border-gray-400 text-gray-400' : ' border-emerald-400'}`}
    >
      {classification && (
        <>
          <div className="relative flex items-center w-24 h-24">
            <img src={classification.img_url} alt={classification.name} />
            <Badge
              variant={`${classification.score < 1 ? 'destructive' : 'secondary'}`}
              className="absolute top-0 right-0 text-xs"
            >{`${(100 * classification.score).toFixed(0)}%`}</Badge>
          </div>
        </>
      )}
      {/* Display detections */}
      <div className="flex flex-col" onClick={() => console.log('Detection Pairs: ', group.detectionPairs)}>
        {group.detectionPairs.map((pair, index) => (
          <div key={uuid()} className="flex items-center">
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
                <div className="w-12 h-12 flex items-center justify-center border border-gray-300 rounded-md">
                  No Image
                </div>
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
                <div className="w-12 h-12 flex items-center justify-center border border-gray-300 rounded-md">
                  No Image
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {classification && (
        <div className="text-xs">
          <div>{`Sorter: ${classification?.sorter}`}</div>
          <div>{`Bin: ${classification?.bin}`}</div>
          <div>{classification.name}</div>
        </div>
      )}
    </div>
  );
};

export default DetectionPairDisplay;
