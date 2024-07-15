// components/AlertDisplay.tsx

// AlertDisplay.tsx
'use client';
import { AlertCircle, XCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { alertStore } from '@/stores/alertStore';
import { Button } from './ui/button';

const AlertDisplay = () => {
  const alertList = alertStore((state) => state.alertList);
  const clearAlertAtTimestamp = alertStore((state) => state.clearAlertAtTimestamp);

  if (alertList.length === 0) {
    return null; // Don't render the component if there are no alertList
  }

  return (
    <div className="fixed left-0 top-0 z-50 w-full">
      <div className="p-2 text-sm text-white">
        {alertList.map((alert) => (
          <Alert
            className={`mb-2 bg-white shadow-md ${
              alert.type === 'error' ? 'border-red-600 text-red-600' : 'border-green-600 text-green-600'
            }`}
            key={alert.timestamp}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="mr-2 h-6 w-6" />
                <div>
                  <AlertTitle className="font-bold">{alert.type.toUpperCase()}</AlertTitle>
                  <AlertDescription>{alert.message}</AlertDescription>
                </div>
              </div>
              <Button onClick={() => clearAlertAtTimestamp(alert.timestamp)} variant="ghost" size="sm" title="Clear">
                <XCircle className="h-6 w-6" />
              </Button>
            </div>
          </Alert>
        ))}
      </div>
    </div>
  );
};

export default AlertDisplay;
