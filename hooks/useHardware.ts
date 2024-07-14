// hooks/useHardware.ts

import { useContext } from 'react';
import { HardwareContext } from '@/contexts/HardwareContext';

// Hook to use the Hardware context
const useHardware = () => {
  const context = useContext(HardwareContext);
  if (context === undefined) {
    throw new Error('useHardware must be used within a HardwareProvider');
  }
  return context;
};

export default useHardware;
