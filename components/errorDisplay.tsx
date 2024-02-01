// ErrorDisplay.tsx
import { AlertCircle, XCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { sortProcessStore } from "@/stores/sortProcessStore";
import { Button } from "./ui/button";

const ErrorDisplay = () => {
  const errors = sortProcessStore((state) => state.errors);
  const clearError = sortProcessStore((state) => state.clearError);

  if (errors.length === 0) {
    return null; // Don't render the component if there are no errors
  }

  return (
    <div className="fixed top-0 left-0 w-full z-50">
      <div className="text-white text-sm p-2">
        {errors.map((error, index) => (
          <Alert
            className="bg-white mb-2 shadow-md"
            variant="destructive"
            key={`${error}-${index}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="text-red-600 h-6 w-6 mr-2" />
                <div>
                  <AlertTitle className="font-bold">Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </div>
              </div>
              <Button
                onClick={() => clearError(index)}
                variant="ghost"
                size="sm"
                title="Clear error"
              >
                <XCircle className="text-red-600 h-6 w-6" />
              </Button>
            </div>
          </Alert>
        ))}
      </div>
    </div>
  );
};

export default ErrorDisplay;
