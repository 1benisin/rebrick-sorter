import { useMemo, useState } from 'react';
import { Button, Offcanvas, Spinner } from 'react-bootstrap';
import styled from 'styled-components';
import { useAtom } from 'jotai';
import { sideBarPartNumAtom, sideBarOpenAtom } from '../logic/atoms';
import useColors from '../fetchers/useColors';

export default function AddPartSidebar() {
  const [partNum] = useAtom(sideBarPartNumAtom);
  const [open, setOpen] = useAtom(sideBarOpenAtom);
  const { data: colors, isLoading, error } = useColors(partNum);

  const toggleSideBar = (e) => {
    setOpen(!open);
  };

  return (
    <div>
      <Offcanvas show={open} placement="end" onHide={toggleSideBar}>
        <Offcanvas.Header>{`Known Colors for part ${partNum}`}</Offcanvas.Header>
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
