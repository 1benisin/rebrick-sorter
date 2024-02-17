// settings/page.tsx
'use client';

import SettingsForm from '@/components/SettingsForm';
// import CalibrationButton from '@/components/CalibrationButton';
import DualVideo from '@/components/DualVideo';
const SettingsPage = () => {
  return (
    <div className="p-4">
      <DualVideo />

      <SettingsForm />
    </div>
  );
};

export default SettingsPage;
