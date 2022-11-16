import useSWR from 'swr';

export const fetchColors = async (partId) => {
  console.log('FETCH - colors', partId);
  const url = partId ? `/api/colors/${partId}` : `/api/colors`;
  const res = await fetch(url);
  const data = await res.json();

  if (res.status !== 200) {
    console.warn(data);
    throw new Error(data);
  }
  return data;
};

export default function useColors(partId = null) {
  const SWRid = partId ? `${partId}_color` : 'colors';

  const { data, error } = useSWR(SWRid, () => fetchColors(partId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  return {
    data,
    isLoading: !error && !data,
    error,
  };
}
