import { Form } from 'react-bootstrap';
import { useGeneralStore } from '../logic/store';

export default function SearchInput() {
  const setSearchFilter = useGeneralStore((state) => state.setSearchFilter);

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
