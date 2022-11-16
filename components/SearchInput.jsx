import { Form } from 'react-bootstrap';
import { searchFilterAtom, filteredaPartsAtom } from '../logic/atoms';
import { useAtom } from 'jotai';

export default function SearchInput() {
  const [_, setSearchFilter] = useAtom(searchFilterAtom);
  // const [_, setFilteredParts] = useAtom(filteredaPartsAtom);

  const onSearchSubmit = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setSearchFilter(e.target.value);
    }
  };

  return (
    <Form onKeyDown={onSearchSubmit}>
      {/* <Form.Group className="mb-3" controlId="exampleForm.ControlInput1"> */}
      {/* <Form.Label>Email address</Form.Label> */}
      <Form.Control placeholder="Search" />
      {/* </Form.Group> */}
    </Form>
  );
}
