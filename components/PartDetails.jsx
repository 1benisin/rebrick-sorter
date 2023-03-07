import styled from 'styled-components';
import useColors from '../fetchers/useColors';
import partStore from '../lib/stores/partStore';
import PartField from './PartField';

export default function PartDetails() {
  const focusedPart = partStore((state) => state.focusedPart);
  const { data: colors, isLoading, error } = useColors(focusedPart?.id);

  const onFieldEdit = () => {
    console.log('onFieldEdit');
  };

  return (
    <div>
      {focusedPart && (
        <div>
          <PartField field="name" value={focusedPart.name} onEdit={onFieldEdit} />
          <PartField field="id" value={focusedPart.id} onEdit={onFieldEdit} />
          <PartField field="catName" value={focusedPart?.catName} onEdit={onFieldEdit} />
          <ColorColumn>
            {colors &&
              colors.map((color) => (
                <ColorRow key={color.color_id}>
                  <ColorSquare code={`#${color.color_code}`} />
                  <ColorName>{color.color_name}</ColorName>
                </ColorRow>
              ))}
          </ColorColumn>
        </div>
      )}
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
