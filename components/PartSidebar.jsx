import { Button, Offcanvas, Spinner } from 'react-bootstrap';
import styled from 'styled-components';
import useColors from '../fetchers/useColors';
import applicationStore from '../lib/stores/applicationStore';
import PartDetail from './PartDetail';

export default function PartSidebar() {
  const sidebarPart = applicationStore((state) => state.sidebarPart);
  const partSidebarOpen = applicationStore((state) => state.partSidebarOpen);
  const togglePartSidebar = applicationStore((state) => state.togglePartSidebar);
  const { data: colors, isLoading, error } = useColors(sidebarPart?.id);

  return (
    <div>
      <Offcanvas show={partSidebarOpen} placement="end" onHide={() => togglePartSidebar()}>
        {/* <Offcanvas.Header>{`Part Details ${sidebarPart?.id}`}</Offcanvas.Header> */}
        <Offcanvas.Body>
          {sidebarPart && (
            <div>
              <PartDetail field="name" value={sidebarPart.name} />
              <PartDetail field="id" value={sidebarPart.id} />
              <PartDetail field="catName" value={sidebarPart?.catName} />
              <ColorColumn>
                {colors.map((color) => (
                  <ColorRow key={color.color_id}>
                    <ColorSquare code={`#${color.color_code}`} />
                    <ColorName>{color.color_name}</ColorName>
                  </ColorRow>
                ))}
              </ColorColumn>
            </div>
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
