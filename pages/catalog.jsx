import Head from 'next/head';
import ProtectedRoute from '../components/ProtectedRoute';
import PartsSearchInput from '../components/PartsSearchInput';
import PartsSearchResults from '../components/PartsSearchResults';
import PartSidebar from '../components/PartSidebar';
import ImageSearchButton from '../components/ImageSearchButton';
// import '../logic/scrapeBLRelationships';

export default function Catalog() {
  return (
    <>
      <Head>
        <title>Rebrick Catalog</title>
      </Head>

      <ProtectedRoute>
        <ImageSearchButton />
        <PartSidebar />
        <PartsSearchInput />
        <PartsSearchResults />
      </ProtectedRoute>
    </>
  );
}
