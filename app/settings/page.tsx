// settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { settingsStore } from "@/stores/settingsStore";
import SorterSettings from "@/components/SorterSettings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const SettingsPage = () => {
  const {
    conveyorVelocity,
    setConveyorVelocity,
    sorters,
    addSorterAtIndex,
    removeSorterAtIndex,
    saveSettings,
    loaded,
  } = settingsStore();

  // Local state for form elements to avoid direct store manipulation on each keystroke
  const [localConveyorVelocity, setLocalConveyorVelocity] =
    useState(conveyorVelocity);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    setLocalConveyorVelocity(conveyorVelocity);
  }, [conveyorVelocity]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await saveSettings(); // Assume saveSettings is now an async function
      setSuccessMessage("Settings have been saved!");
      setTimeout(() => setSuccessMessage(""), 5000); // Hide success message after 5 seconds
    } catch (error) {
      setSuccessMessage("Failed to save settings");
      setTimeout(() => setSuccessMessage(""), 5000); // Hide success message after 5 seconds
      console.error("Failed to save settings:", error);
      // Handle save error (e.g., show error message to the user)
    }
    setIsSaving(false);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Settings</h1>
      <p className={`${loaded ? "text-green-500" : "text-red-500"}`}>
        {loaded ? "Settings loaded" : "Loading settings..."}
      </p>

      <div>
        <Label htmlFor="conveyorVelocity" className="block mb-2">
          Conveyor Velocity (pixels/second):
        </Label>
        <Input
          id="conveyorVelocity"
          type="number"
          className="border px-2 py-1"
          value={localConveyorVelocity}
          onChange={(e) => setLocalConveyorVelocity(Number(e.target.value))}
          onBlur={() => setConveyorVelocity(localConveyorVelocity)} // Update store on input blur
        />
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-4">Sorters:</h2>

        {sorters.map((sorter, index) => (
          <SorterSettings
            key={index}
            sorter={sorter}
            index={index}
            deleteSorter={() => removeSorterAtIndex(index)}
          />
        ))}
        <div className="mt-6 flex items-center">
          <Button
            className="bg-blue-500 text-white px-2 py-1"
            onClick={() => addSorterAtIndex(sorters.length)}
          >
            Add Sorter
          </Button>
          <Button
            className="ml-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            variant={isSaving ? "outline" : "default"}
            onClick={handleSaveSettings}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
          {successMessage && (
            <span className="ml-4 text-green-500">{successMessage}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
