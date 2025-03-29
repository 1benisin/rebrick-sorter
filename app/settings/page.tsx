// app/settings/page.tsx

// settings/page.tsx
'use client';

import SettingsForm from '@/components/SettingsForm';
import ConveyorCalibrationButton from '@/components/buttons/ConveyorCalibrationButton';
import DualVideo from '@/components/DualVideo';
import StatusIndicator from '@/components/StatusIndicator';
import ConveyorButton from '@/components/buttons/ConveyorButton';
import MoveSorterButton from '@/components/buttons/MoverSorterButton';
import HomeSorterButton from '@/components/buttons/HomeSorterButton';
import JetButton from '@/components/buttons/JetButton';
import JetCalibrationButton from '@/components/buttons/JetCalibrationButton';

const SettingsPage = () => {
  return (
    <div className="p-4">
      {/* <StatusIndicator /> */}
      <DualVideo />
      <div className="flex items-end gap-2 pt-2">
        <ConveyorCalibrationButton />
        <MoveSorterButton />
        <JetButton />
        <HomeSorterButton />
        <ConveyorButton />
      </div>
      <div className="flex items-end gap-2 pt-2">
        <JetCalibrationButton jetNumber={0} />
        <JetCalibrationButton jetNumber={1} />
        <JetCalibrationButton jetNumber={2} />
        <JetCalibrationButton jetNumber={3} />
      </div>
      <SettingsForm />
    </div>
  );
};

export default SettingsPage;
