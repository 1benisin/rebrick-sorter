import { useState } from 'react';
import styled from 'styled-components';
// import { useAtom } from 'jotai';
// import { Spinner } from 'react-bootstrap';
import PartCard from './PartCard';
// import { searchFilterAtom } from '../logic/atoms';
// import useFilteredParts from '../fetchers/useFilteredParts';
// import useRelatedParts from '../fetchers/useRelatedParts';
import partStore from '../lib/stores/partStore';

export default function PartsSearchResults({}) {
  const [selectedPartId, setSelectedPartId] = useState('');
  // const [searchFilter, setSearchFilter] = useAtom(searchFilterAtom);
  // const { data: filteredParts, isLoading, error } = useFilteredParts(searchFilter);
  // const {
  //   data: relatedParts,
  //   isLoading: relatedPartsLoading,
  //   error: relatedPartsError,
  // } = useRelatedParts(selectedPartId);

  const searchResults = partStore((state) => state.searchResults);

  // const handleSelectPart = (partId) => {
  //   setSearchFilter('');
  //   setSelectedPartId(partId);
  // };

  // if (isLoading) return <Spinner animation="border" />;
  // if (error) return <p>error</p>;

  return (
    <>
      {/* {relatedPartsLoading ? (
        <Spinner />
      ) : (
        <Grid>
          {relatedParts.map((id) => (
            <PartCard
              onSelect={() => handleSelectPart(id)}
              selected={selectedPartId == id ? true : false}
              key={id}
              partId={id}
            ></PartCard>
          ))}
        </Grid>
      )} */}
      {searchResults && (
        <Grid>
          {searchResults.map((part) => (
            <PartCard
              onSelect={() => handleSelectPart(part.partId)}
              selected={selectedPartId == part.partId ? true : false}
              key={part.partId}
              partId={part.partId}
              part={part}
            ></PartCard>
          ))}
        </Grid>
      )}
    </>
  );
}

const Grid = styled.section`
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-gap: 2px;
  margin-top: 10px;
`;
