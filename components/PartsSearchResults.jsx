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
  const searchResults = partStore((state) => state.searchResults, shallow);

  return (
    <Grid>
      {searchResults.map((part) => (
        <PartCard key={part.id} part={part}></PartCard>
      ))}
    </Grid>
  );
}

const Grid = styled.section`
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-gap: 2px;
  margin-top: 10px;
`;
