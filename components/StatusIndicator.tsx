// components/StatusIndicator.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName, ServiceState } from '@/lib/services/Service.interface';

const StatusIndicator = () => {
  const [serviceStates, setServiceStates] = useState<Record<ServiceName, ServiceState>>(
    {} as Record<ServiceName, ServiceState>,
  );

  const serviceStateColor = {
    [ServiceState.INITIALIZING]: 'bg-yellow-700',
    [ServiceState.INITIALIZED]: 'bg-green-700',
    [ServiceState.UNINITIALIZED]: 'bg-gray-500',
    [ServiceState.FAILED]: 'bg-red-700',
  } as const;

  const updateServiceStates = useCallback(() => {
    const newStates = {} as Record<ServiceName, ServiceState>;
    Object.values(ServiceName).forEach((serviceName) => {
      newStates[serviceName] = serviceManager.getServiceState(serviceName);
    });
    setServiceStates(newStates);
  }, []);

  useEffect(() => {
    updateServiceStates();
    const interval = setInterval(updateServiceStates, 10000); // every 10 seconds
    return () => clearInterval(interval);
  }, [updateServiceStates]);

  const handleServiceInit = (serviceName: ServiceName) => {
    const service = serviceManager.getService(serviceName);
    if (service && typeof service.init === 'function') {
      console.log(`ReInitializing ${serviceName} from status indicator`);
      service.init();
    }
  };

  return (
    <div className="fixed right-0 top-2 m-2 flex flex-col gap-2 rounded-md bg-slate-400 p-2 opacity-90">
      {Object.entries(serviceStates).map(([serviceName, state]) => (
        <div
          key={serviceName}
          className={cn(serviceStateColor[state], 'mx-auto w-full cursor-pointer rounded-md px-2')}
          onClick={() => handleServiceInit(serviceName as ServiceName)}
        >
          {serviceName}
        </div>
      ))}
    </div>
  );
};

export default StatusIndicator;
