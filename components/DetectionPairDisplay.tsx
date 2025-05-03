import React, { useState } from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { DetectionPairGroup, mockDetectionPairGroup } from '@/types/detectionPairs.d';
import { v4 as uuid } from 'uuid';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useSettings } from '@/components/hooks/useSettings';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// Helper function to map sorter index to letter
const getSorterLetter = (index: number | string | undefined): string => {
  if (index === undefined) return '?';
  const numIndex = typeof index === 'string' ? parseInt(index, 10) : index;
  if (isNaN(numIndex) || numIndex < 0 || numIndex > 3) return String(index); // Return original if invalid
  return String.fromCharCode(65 + numIndex); // 65 is ASCII for 'A'
};

const DetectionPairDisplay = () => {
  const detectionPairGroups = sortProcessStore((state) => state.detectionPairGroups);

  return (
    <>
      <div className={`flex`} onClick={() => console.log(detectionPairGroups)}>
        {detectionPairGroups.map((group) => (
          <DetectionCard key={group.id} group={group} />
        ))}
      </div>
    </>
  );
};

const DetectionCard = ({ group }: { group: DetectionPairGroup }) => {
  const { settings } = useSettings();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
    <>
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
        {classification && (
          <div className="text-xs">
            <div>
              Sorter: <span className="font-bold text-blue-500">{getSorterLetter(classification?.sorter)}</span>
            </div>
            <div>
              Bin: <span className="font-bold text-purple-500">{classification?.bin}</span>
            </div>
            <div>{classification.name}</div>
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
                    className={`cursor-pointer ${
                      group.indexUsedToClassify != undefined && group.indexUsedToClassify === index
                        ? 'h-12 w-12 rounded-md border border-red-500'
                        : 'h-12 w-12 rounded-md'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(pair[0].imageURI);
                    }}
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
                    className={`cursor-pointer ${
                      group.indexUsedToClassify != undefined && group.indexUsedToClassify === index
                        ? 'h-12 w-12 rounded-md border border-red-500'
                        : 'h-12 w-12 rounded-md'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(pair[1].imageURI);
                    }}
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
      </Card>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="flex items-center justify-center">
          {selectedImage && (
            <img src={selectedImage} alt="Full size image" className="h-[299px] w-[299px] object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DetectionPairDisplay;
