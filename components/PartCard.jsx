import { Card, Badge, Spinner } from 'react-bootstrap';
import styled from 'styled-components';
import { useAtom } from 'jotai';
import Image from './ImageWithFallback';
import { sideBarPartNumAtom, sideBarOpenAtom } from '../logic/atoms';
import partStore from '../lib/stores/partStore';
import applicationStore from '../lib/stores/applicationStore';

export default function PartCard({ part }) {
  const [sideBarPartId, setSideBarPartId] = useAtom(sideBarPartNumAtom);
  const [open, setOpen] = useAtom(sideBarOpenAtom);

  const findSimilar = partStore((state) => state.findSimilar);
  const similarToPartId = partStore((state) => state.similarToPartId);
  const togglePartSidebar = applicationStore((state) => state.togglePartSidebar);

  const handleAddButtonClick = (e) => {
    e.stopPropagation();
    console.log('handleAddButtonClick', part);
    togglePartSidebar(part);
  };

  // if (isLoading) return <Spinner animation="border" />;
  // if (error) return <p>error</p>;
  return (
    <Card bg={similarToPartId == part.id ? 'primary' : null} onClick={() => findSimilar(part.id)}>
      {similarToPartId}
      <Image
        src={part.thumbnail_url}
        alt={part.name}
        width={200}
        height={150}
        // layout="intrinsic" // you can use "responsive", "fill" or the default "intrinsic"
        objectFit="contain"
      />
      {/* <PartCategory>{part.category_id}</PartCategory> */}
      <PartId selected={similarToPartId == part.id}>{part.id}</PartId>
      <PartId>{part.timestamp.seconds}</PartId>
      <PartName selected={similarToPartId == part.id}>
        {/* {JSON.stringify(part)} */}
        {part.name}
        {/* {removeCategoryFromName(name, part.category_name)} */}
      </PartName>
      <FlexDiv>
        {part.searchScore && (
          <MatchPercent>{`${(part.searchScore * 100).toFixed(0)}% match`}</MatchPercent>
        )}
        <AddButton pill={true} bg="success" onClick={handleAddButtonClick}>
          +
        </AddButton>
      </FlexDiv>
    </Card>
  );
}

const removeCategoryFromName = (name, category) => {
  const categoryWords = category.split(' ');
  let newName = name;
  categoryWords.forEach((w) => {
    const word = w.replace(',', '');
    const regex = new RegExp(word, 'i');
    newName = newName.replace(regex, '');
  });
  return newName.replace(/[^a-zA-Z0-9\s]/, ''); // get rid of non alpha=numberic at beginning of scentence
};

const PartCategory = styled(Card.Subtitle)`
  font-size: x-small;
  font-weight: bold;
  color: ${(props) => (props.selected ? 'White' : 'Black')};
  margin: 0px 2px;
`;

const PartName = styled(Card.Title)`
  font-size: x-small;
  color: ${(props) => (props.selected ? 'White' : 'Black')};
  flex: auto;
  margin: 0;
`;

const FlexDiv = styled.div`
  display: flex;
  margin: 5px;
`;

const PartId = styled(Card.Text)`
  font-size: xx-small;
  color: ${(props) => (props.selected ? 'LightGray' : 'Gray')};
  align-self: center;
  // flex: auto;
  margin: 0;
`;

const MatchPercent = styled(Card.Subtitle)`
  font-size: x-small;
  color: green;
`;

const AddButton = styled(Badge)`
  font-size: xx-small;
  cursor: pointer;
  right: 3px;
  bottom: 3px;
  position: absolute;
`;
