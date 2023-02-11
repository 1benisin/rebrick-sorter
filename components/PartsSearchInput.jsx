import { useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import partStore from '../lib/stores/partStore';

export default function PartsSearchInput() {
  const search = partStore((state) => state.search);
  const searchString = partStore((state) => state.searchString);
  const setSearchString = partStore((state) => state.setSearchString);
  const inputRef = useRef(null);

  const onSearchSubmit = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      search();
      inputRef.current.select();
    }
  };

  return (
    <Form onKeyDown={onSearchSubmit}>
      <Form.Control
        value={searchString}
        onChange={(e) => setSearchString(e.target.value)}
        placeholder="Search"
        ref={inputRef}
      />
    </Form>
  );
}
