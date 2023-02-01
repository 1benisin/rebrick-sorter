import Head from 'next/head';
import ProtectedRoute from '../components/ProtectedRoute';
import PartsSearchInput from '../components/PartsSearchInput';
import PartsSearchResults from '../components/PartsSearchResults';
import AddPartSidebar from '../components/AddPartSidebar';
// import '../logic/scrapeBLRelationships';

export default function Catalog() {
  return (
    <>
      <Head>
        <title>Rebrick Catalog</title>
      </Head>

      <ProtectedRoute>
        <AddPartSidebar />
        <PartsSearchInput />
        <PartsSearchResults />
      </ProtectedRoute>
    </>
  );
}
