// components/DetectionPairDisplay.tsx

// DetectionDisplay.jsx

import React from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { DetectionPairGroup, mockDetectionPairGroup } from '@/types/detectionPairs.d';
import { v4 as uuid } from 'uuid';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useSettings } from '@/hooks/useSettings';

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
  const { settings } = useSettings();
  const classification = group.classificationResult || null;
  const skipSort = group.skipSort || null;
  const skipSortReason = group.skipSortReason || null;

  if (!settings) {
    return <div>Loading Settings...</div>;
  }

  const calculateBGColor = (score: number) => {
    return score < settings.classificationThresholdPercentage ? 'bg-red-500' : 'bg-green-500';
  };

  return (
    <Card
      className={`min-w-28 mr-1 flex w-28 flex-col items-center p-1 ${group.skipSortReason ? 'border-2 border-red-400 text-red-400' : ''}`}
    >
      {classification && (
        <div className={`relative flex h-24 w-24 items-center`}>
          <img
            src={classification.img_url}
            alt={classification.name}
            className="max-h-full max-w-full object-contain"
          />
          <Badge
            className={`absolute right-0 top-0 text-xs ${calculateBGColor(classification.score)}`}
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
                      ? 'h-12 w-12 rounded-md border border-red-500'
                      : 'h-12 w-12 rounded-md'
                  }
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-300">
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
                      ? 'h-12 w-12 rounded-md border border-red-500'
                      : 'h-12 w-12 rounded-md'
                  }
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-300">
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
