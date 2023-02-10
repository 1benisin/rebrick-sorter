import { useRef } from 'react';
import { Form } from 'react-bootstrap';
import partStore from '../lib/stores/partStore';

export default function PartsSearchInput() {
  const search = partStore((state) => state.search);
  const inputRef = useRef(null);

  const onSearchSubmit = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      search(e.target.value);
      inputRef.current.select();
    }
  };

  return (
    <Form onKeyDown={onSearchSubmit}>
      <Form.Control placeholder="Search" ref={inputRef} />
    </Form>
  );
}
