// DetectionDisplay.jsx

import React from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { DetectionPairGroup, mockDetectionPairGroup } from '@/types/detectionPairs.d';
import { v4 as uuid } from 'uuid';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { settingsStore } from '@/stores/settingsStore';

const DetectionPairDisplay = () => {
  const detectionPairGroups = sortProcessStore((state) => state.detectionPairGroups);

  return (
    <>
      <div className={`flex`} onClick={() => console.log(detectionPairGroups)}>
        {detectionPairGroups.map((group) => (
          <DetectionCard key={group.id} group={group} />
        ))}
        {/* {Array.from({ length: 7 }, () => mockDetectionPairGroup).map((group) => (
          <DetectionCard key={group.id} group={group} />
        ))} */}
      </div>
    </>
  );
};

const DetectionCard = ({ group }: { group: DetectionPairGroup }) => {
  const settings = settingsStore((state) => state.settings);
  const classification = group.classificationResult || null;
  const skipSort = group.skipSort || null;
  const skipSortReason = group.skipSortReason || null;

  const calculateBGColor = (score: number) => {
    return score < settings.classificationThresholdPercentage ? 'bg-red-500' : 'bg-green-500';
  };

  return (
    <Card
      className={`flex flex-col items-center mr-1 p-1 w-28 min-w-28 ${group.skipSortReason ? ' border-red-400 text-red-400 border-2' : ''}`}
    >
      {classification && (
        <div className={`relative flex items-center w-24 h-24 `}>
          <img
            src={classification.img_url}
            alt={classification.name}
            className="object-contain max-w-full max-h-full"
          />
          <Badge
            className={`absolute top-0 right-0 text-xs ${calculateBGColor(classification.score)}`}
          >{`${(100 * classification.score).toFixed(0)}%`}</Badge>
        </div>
      )}
      {skipSortReason && <div className="text-xs text-red-700">{`${skipSortReason}: ${skipSort}`}</div>}
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
    </Card>
  );
};

export default DetectionPairDisplay;
