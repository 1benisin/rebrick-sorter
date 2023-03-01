import { useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import styled from 'styled-components';
import partStore from '../lib/stores/partStore';

export default function PartsSearchInput() {
  const search = partStore((state) => state.search);
  const searchString = partStore((state) => state.searchString);
  const setSearchString = partStore((state) => state.setSearchString);
  const setIncludePrints = partStore((state) => state.setIncludePrints);
  const inputRef = useRef(null);

  const onSearchSubmit = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      search(searchString);
      inputRef.current.select();
    }
  };

  return (
    <StyledForm onKeyDown={onSearchSubmit}>
      <Form.Control
        value={searchString}
        onChange={(e) => setSearchString(e.target.value)}
        placeholder="Search"
        ref={inputRef}
      />
      <Form.Check
        inline
        label="prints"
        type={'checkbox'}
        onChange={(e) => setIncludePrints(e.target.checked)}
      />
    </StyledForm>
  );
}

const StyledForm = styled(Form)`
  display: flex;
  & > * {
    margin: auto;
    margin-right: 5px;
  }
`;
