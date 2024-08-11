// components/ServiceInitializer.tsx

'use client';

import { useEffect, useState } from 'react';
import serviceManager from '@/lib/services/ServiceManager';

export default function ServiceInitializer({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function initializeServices() {
      await serviceManager.initializeAll();
      setIsInitialized(true);
    }

    initializeServices();
  }, []);

  if (!isInitialized) {
    return <div>Initializing services...</div>;
  }

  return <>{children}</>;
}
