// SorterSettings.tsx

import React, { useState } from 'react';
import { settingsStore } from '@/stores/settingsStore';
import { Sorter } from '@/types/types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';

type SorterSettingsProps = {
  sorter: Sorter;
  index: number;
  deleteSorter: (index: number) => void;
};

const SorterSettings: React.FC<SorterSettingsProps> = ({ sorter, index, deleteSorter }) => {
  const { updateSorter } = settingsStore();
  const [localSorter, setLocalSorter] = useState<Sorter>(sorter);

  const handleUpdate = (updatedFields: Partial<Sorter>) => {
    const updatedSorter = { ...localSorter, ...updatedFields };
    setLocalSorter(updatedSorter);
    updateSorter(index, updatedSorter);
  };

  return (
    <div className="border p-4 mb-4 rounded-lg">
      <div className="flex items-end space-x-4">
        <Label className="block">
          Name:
          <Input type="text" value={localSorter.name} onChange={(e) => handleUpdate({ name: e.target.value })} className="border px-2 py-1 w-full" />
        </Label>

        <Label className="block">
          Grid Width:
          <Input
            type="number"
            value={localSorter.gridDimensions.width}
            onChange={(e) =>
              handleUpdate({
                gridDimensions: {
                  ...localSorter.gridDimensions,
                  width: parseInt(e.target.value, 10),
                },
              })
            }
            className="border px-2 py-1 w-full"
          />
        </Label>

        <Label className="block">
          Grid Height:
          <Input
            type="number"
            value={localSorter.gridDimensions.height}
            onChange={(e) =>
              handleUpdate({
                gridDimensions: {
                  ...localSorter.gridDimensions,
                  height: parseInt(e.target.value, 10),
                },
              })
            }
            className="border px-2 py-1 w-full"
          />
        </Label>

        <Label className="block">
          Air Jet Position:
          <Input
            type="number"
            value={localSorter.airJetPosition}
            onChange={(e) => handleUpdate({ airJetPosition: parseInt(e.target.value, 10) })}
            className="border px-2 py-1 w-full"
          />
        </Label>

        <Label className="block">
          Max Part Dimension:
          <Input
            type="number"
            value={localSorter.maxPartDimension}
            onChange={(e) => handleUpdate({ maxPartDimension: parseInt(e.target.value, 10) })}
            className="border px-2 py-1 w-full"
          />
        </Label>

        <Button
          onClick={() => deleteSorter(index)}
          variant={'destructive'}
          // className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
        >
          Delete Sorter
        </Button>
      </div>
    </div>
  );
};

export default SorterSettings;
