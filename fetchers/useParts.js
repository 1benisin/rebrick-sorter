import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../logic/firebase';
import useSWR from 'swr';

const fetchParts = async (partId) => {
  const url = partId ? `/api/parts/${partId}` : `/api/parts`;
  const res = await fetch(url);
  const data = await res.json();

  if (res.status !== 200) {
    console.warn(data);
    throw new Error(data);
  }
  return data;
};

export default function useParts(partId = null) {
  const SWRid = partId ? `${partId}_part` : 'parts';

  const { data, error } = useSWR(SWRid, () => fetchParts(partId), {
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
