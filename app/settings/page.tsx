// app/settings/page.tsx

// settings/page.tsx
'use client';

import SettingsForm from '@/components/SettingsForm';
import CalibrationButton from '@/components/buttons/CalibrationButton';
import DualVideo from '@/components/DualVideo';
import StatusIndicator from '@/components/StatusIndicator';
import ConveyorButton from '@/components/buttons/ConveyorButton';
import MoveSorterButton from '@/components/buttons/MoverSorterButton';
import HomeSorterButton from '@/components/buttons/HomeSorterButton';
import JetButton from '@/components/buttons/JetButton';

const SettingsPage = () => {
  return (
    <div className="p-4">
      {/* <StatusIndicator /> */}
      <DualVideo />
      <div className="flex items-end gap-2 pt-2">
        <CalibrationButton />
        <MoveSorterButton />
        <JetButton />
        <HomeSorterButton />
        <ConveyorButton />
      </div>
      <SettingsForm />
    </div>
  );
};

export default SettingsPage;
