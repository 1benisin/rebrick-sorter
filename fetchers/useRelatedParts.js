import { useMemo } from 'react';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../logic/firebase';
import useSWR from 'swr';

const fetchRelatedParts = async (partId) => {
  console.log('fetchRelatedParts', partId);
  const res = await fetch(
    '/api/partRelated?' + new URLSearchParams({ partId })
  );
  const data = await res.json();

  if (res.status !== 200) {
    console.warn(data);
    throw new Error(data);
  }
  return data;
};

export default function useRelatedParts(partId) {
  const fetcher = () => fetchRelatedParts(partId);

  const { data, error } = useSWR(`relatedParts${partId}`, fetcher, {
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
