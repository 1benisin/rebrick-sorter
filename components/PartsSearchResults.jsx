import { useState } from 'react';
import styled from 'styled-components';
import { shallow } from 'zustand/shallow';
import { Spinner } from 'react-bootstrap';
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

  // const searchResults = partStore((state) => state.searchResults);
  // const isLoading = partStore((state) => state.isLoading);
  const searchResults = partStore((state) => state.searchResults, shallow);
  const similarResults = partStore((state) => state.similarResults, shallow);
  const similarToPartId = partStore((state) => state.similarToPartId);

  // if (searchResults.isLoading)
  //   return (
  //     <FlexDiv>
  //       <Spinner animation="border" />
  //       <p>Searching & Updating Parts...</p>
  //     </FlexDiv>
  //   );
  // if (searchResults.error) return <p>{searchResults.error}</p>;

  return (
    <>
      {similarResults.isLoading ? (
        <FlexDiv>
          <Spinner animation="border" />
          <p>Fetching & Updating Similar Parts...</p>
        </FlexDiv>
      ) : (
        <Grid>
          {similarResults.data.map((part) => (
            <PartCard key={part.id} part={part}></PartCard>
          ))}
        </Grid>
      )}
      <Grid>
        {searchResults.map((part) => (
          <PartCard key={part.id} part={part}></PartCard>
        ))}
      </Grid>
    </>
  );
}

const FlexDiv = styled.div`
  display: flex;
  & > * {
    margin: 10px;
  }
`;

const Grid = styled.section`
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-gap: 2px;
  margin-top: 10px;
`;
