import { useContext } from 'react';
import { SortControllerContext } from '@/contexts/SortControllerContext';

const useSortController = () => {
  const context = useContext(SortControllerContext);
  if (context === undefined) {
    throw new Error('useSortController must be used within a SortControllerProvider');
  }
  return context;
};

export default useSortController;
