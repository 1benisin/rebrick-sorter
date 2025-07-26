// app/settings/page.tsx

// settings/page.tsx
'use client';

import SettingsForm from '@/components/SettingsForm';
import ConveyorCalibrationButton from '@/components/buttons/ConveyorCalibrationButton';
import DualVideo from '@/components/DualVideo';
import ConveyorButton from '@/components/buttons/ConveyorButton';
import MoveSorterButton from '@/components/buttons/MoverSorterButton';
import HomeSorterButton from '@/components/buttons/HomeSorterButton';
import JetButton from '@/components/buttons/JetButton';
import JetCalibrationButton from '@/components/buttons/JetCalibrationButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SettingsPage = () => {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings & Calibration</h1>
        <Button type="submit" form="settings-form">
          Save Settings
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live Feeds</CardTitle>
        </CardHeader>
        <CardContent>
          <DualVideo />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <ConveyorCalibrationButton />
            <MoveSorterButton />
            <JetButton />
            <HomeSorterButton />
            <ConveyorButton />
            <JetCalibrationButton jetNumber={0} />
            <JetCalibrationButton jetNumber={1} />
            <JetCalibrationButton jetNumber={2} />
            <JetCalibrationButton jetNumber={3} />
          </div>
        </CardContent>
      </Card>

      <SettingsForm />
    </div>
  );
};

export default SettingsPage;
