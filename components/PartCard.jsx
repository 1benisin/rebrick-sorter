import { Card, Badge, Spinner } from 'react-bootstrap';
import styled from 'styled-components';
import { useAtom } from 'jotai';
import Image from './ImageWithFallback';
import { sideBarPartNumAtom, sideBarOpenAtom } from '../logic/atoms';
import partStore from '../lib/stores/partStore';

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

export default function PartCard({ part, selected }) {
  const [sideBarPartId, setSideBarPartId] = useAtom(sideBarPartNumAtom);
  const [open, setOpen] = useAtom(sideBarOpenAtom);

  const findSimilar = partStore((state) => state.findSimilar);
  const search = partStore((state) => state.search);

  const handleAddClick = (e) => {
    setSideBarPartIdpart(part.id);
    setOpen(true);
  };

  // if (isLoading) return <Spinner animation="border" />;
  // if (error) return <p>error</p>;
  return (
    <Card bg={selected ? 'primary' : null} onClick={() => findSimilar(part.id)}>
      <Image
        src={part.thumbnail_url}
        alt={part.name}
        width={200}
        height={150}
        // layout="intrinsic" // you can use "responsive", "fill" or the default "intrinsic"
        objectFit="contain"
      />
      {/* <PartCategory>{part.category_id}</PartCategory> */}
      <PartId selected={selected}>{part.id}</PartId>
      <PartName selected={selected}>
        {/* {JSON.stringify(part)} */}
        {part.name}
        {/* {removeCategoryFromName(name, part.category_name)} */}
      </PartName>
      <FlexDiv>
        <MatchPercent>{`${part.searchScore?.toFixed(2) * 100}% match`}</MatchPercent>
        <AddButton pill={true} bg="success" onClick={handleAddClick}>
          +
        </AddButton>
      </FlexDiv>
    </Card>
  );
}

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
  // font-weight: bold;
  color: green;
  // align-self: flex-end;
  // margin: 0px 2px;
`;

const AddButton = styled(Badge)`
  font-size: xx-small;
  cursor: pointer;
  right: 3px;
  bottom: 3px;
  position: absolute;
`;
