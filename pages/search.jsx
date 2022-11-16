import Head from 'next/head';
import ProtectedRoute from '../components/ProtectedRoute';
import SearchInput from '../components/SearchInput';
import SearchResults from '../components/SearchResults';
import AddPartSidebar from '../components/AddPartSidebar';
// import '../logic/scrapeBLRelationships';

export default function Search() {
  return (
    <>
      <Head>
        <title>Rebrick Catalog</title>
      </Head>

      <ProtectedRoute>
        <AddPartSidebar />
        <SearchInput />
        <SearchResults />
      </ProtectedRoute>
    </>
  );
}
