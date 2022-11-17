import { Button, Offcanvas, Spinner } from 'react-bootstrap';
import styled from 'styled-components';
import useColors from '../fetchers/useColors';
import { useGeneralStore } from '../logic/store';

export default function AddPartSidebar() {
  const partId = useGeneralStore((state) => state.sideBarPartId);
  const open = useGeneralStore((state) => state.sideBarOpen);
  const setOpen = useGeneralStore((state) => state.setSideBarOpen);
  const { data: colors, isLoading, error } = useColors(partId);

  const toggleSideBar = (e) => {
    setOpen(!open);
  };

  return (
    <div>
      <Offcanvas show={open} placement="end" onHide={toggleSideBar}>
        <Offcanvas.Header>{`Known Colors for part ${partId}`}</Offcanvas.Header>
        <Offcanvas.Body>
          {isLoading ? (
            <Spinner />
          ) : (
            <ColorColumn>
              {colors.map((color) => (
                <ColorRow key={color.color_id}>
                  <ColorSquare code={`#${color.color_code}`} />
                  <ColorName>{color.color_name}</ColorName>
                </ColorRow>
              ))}
            </ColorColumn>
          )}
        </Offcanvas.Body>
      </Offcanvas>
    </div>
  );
}

const ColorColumn = styled.div`
  display: flex;
  flex-direction: column;
`;
const ColorRow = styled.div`
  display: flex;
`;
const ColorSquare = styled.div`
  width: 20px;
  height: 20px;
  margin-right: 10px;
  background-color: ${(props) => props.code};
  border: 1px solid lightgray;
`;
const ColorName = styled.div`
  margin: 0px;
`;
