// settings/page.tsx
'use client';

import { useState } from 'react';
import { settingsStore } from '@/stores/settingsStore';
import SorterSettings from '@/components/SorterSettings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import Video from '@/components/Video';
import CalibrationButton from '@/components/CalibrationButton';

const SettingsPage = () => {
  const {
    conveyorSpeed_PPS,
    setConveyorSpeed_PPS,
    detectDistanceThreshold,
    setDetectDistanceThreshold,
    sorters,
    addSorterAtIndex,
    removeSorterAtIndex,
    saveSettings,
    loaded,
    saved,
    fetchSettings,
  } = settingsStore();

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await saveSettings(); // Assume saveSettings is now an async function
      setSuccessMessage('Settings have been saved!');
      setTimeout(() => setSuccessMessage(''), 5000); // Hide success message after 5 seconds
    } catch (error) {
      setSuccessMessage('Failed to save settings');
      setTimeout(() => setSuccessMessage(''), 5000); // Hide success message after 5 seconds
      console.error('Failed to save settings:', error);
      // Handle save error (e.g., show error message to the user)
    }
    setIsSaving(false);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Settings</h1>
      <p className={`${loaded ? 'text-green-500' : 'text-red-500'}`}>{loaded ? 'Settings loaded' : 'Loading settings...'}</p>
      <Video cameraName="video" />
      <div className="flex items-center">
        <div>
          <Label htmlFor="conveyorSpeed_PPS" className="block mb-2">
            Conveyor Velocity (pixels/second):
          </Label>
          <Input
            id="conveyorSpeed_PPS"
            type="number"
            className="border px-2 py-1"
            value={conveyorSpeed_PPS}
            onChange={(e) => setConveyorSpeed_PPS(Number(e.target.value))}
          />
        </div>
        {/* <CalibrationButton /> */}
      </div>

      <div>
        <Label htmlFor="detectDistanceThreshold" className="block mb-2">
          Detection Distance Threshhold (pixels):
        </Label>
        <Input
          id="detectDistanceThreshold"
          type="number"
          className="border px-2 py-1"
          value={detectDistanceThreshold}
          onChange={(e) => setDetectDistanceThreshold(Number(e.target.value))}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-4">Sorters:</h2>

        {sorters.map((sorter, index) => (
          <SorterSettings key={index} sorter={sorter} index={index} deleteSorter={() => removeSorterAtIndex(index)} />
        ))}
        <div className="mt-6 flex items-center">
          <Button className="bg-blue-500 text-white px-2 py-1" onClick={() => addSorterAtIndex(sorters.length)}>
            Add Sorter
          </Button>
          <Button className="ml-4 bg-blue-500 text-white px-2 py-1" onClick={fetchSettings}>
            Fetch Settings
          </Button>
          <Button
            className="ml-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            variant={isSaving ? 'outline' : 'default'}
            onClick={handleSaveSettings}
            disabled={isSaving || saved}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
          {successMessage && <span className="ml-4 text-green-500">{successMessage}</span>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
