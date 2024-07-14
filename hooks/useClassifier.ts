// hooks/useClassifier.ts

import { useContext } from 'react';
import { ClassifierContext } from '@/contexts/ClassifierContext';

const useClassifier = () => {
  const context = useContext(ClassifierContext);
  if (context === undefined) {
    throw new Error('useClassifier must be used within a ClassifierProvider');
  }
  return context;
};

export default useClassifier;
