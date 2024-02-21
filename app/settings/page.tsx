// settings/page.tsx
'use client';

import SettingsForm from '@/components/SettingsForm';
import CalibrationButton from '@/components/CalibrationButton';
import DualVideo from '@/components/DualVideo';
import StatusIndicator from '@/components/StatusIndicator';

const SettingsPage = () => {
  return (
    <div className="p-4">
      <StatusIndicator />
      <DualVideo />
      <CalibrationButton />
      <SettingsForm />
    </div>
  );
};

export default SettingsPage;
