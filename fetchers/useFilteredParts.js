import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../logic/firebase';
import useSWR from 'swr';

const fetchFilteredParts = async (filterText) => {
  console.log('fetchFilteredParts', filterText);
  const res = await fetch(
    '/api/partSearch?' + new URLSearchParams({ filterText })
  );
  const data = await res.json();

  if (res.status !== 200) {
    console.warn(data);
    throw new Error(data);
  }
  return data;
};

export default function useFilteredParts(filterText) {
  const fetcher = () => fetchFilteredParts(filterText);

  const { data, error } = useSWR(`filteredParts${filterText}`, fetcher, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  return {
    data: data,
    isLoading: !error && !data,
    error,
  };
}
