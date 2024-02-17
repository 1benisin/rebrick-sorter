// settings/page.tsx
'use client';

import { settingsStore } from '@/stores/settingsStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DetectDistanceThresholdInput = () => {
  const { detectDistanceThreshold, setDetectDistanceThreshold } = settingsStore();

  return (
    <div>
      <Label htmlFor="detectDistanceThreshold" className="block mb-2">
        Detection Distance Threshhold (pixels):
      </Label>
      <Input
        id="detectDistanceThreshold"
        type="number"
        className="border px-2 py-1"
        value={detectDistanceThreshold}
        onBlur={(e) => setDetectDistanceThreshold(Number(e.target.value))}
        onChange={(e) => setDetectDistanceThreshold(Number(e.target.value))}
      />
    </div>
  );
};

export default DetectDistanceThresholdInput;
