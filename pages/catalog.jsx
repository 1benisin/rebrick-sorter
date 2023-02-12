import Head from 'next/head';
import ProtectedRoute from '../components/ProtectedRoute';
import PartsSearchInput from '../components/PartsSearchInput';
import PartsSearchResults from '../components/PartsSearchResults';
import PartSidebar from '../components/PartSidebar';
// import '../logic/scrapeBLRelationships';

export default function Catalog() {
  return (
    <>
      <Head>
        <title>Rebrick Catalog</title>
      </Head>

      <ProtectedRoute>
        <PartSidebar />
        <PartsSearchInput />
        <PartsSearchResults />
      </ProtectedRoute>
    </>
  );
}
