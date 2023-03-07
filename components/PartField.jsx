import styled from 'styled-components';
import React, { useState } from 'react';

const PartField = ({ field, value, onEdit = null }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [fieldValue, setFieldValue] = useState(value);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleSaveClick = (updatedValue) => {
    console.log('updatedValue', updatedValue);
    setIsEditing(false);

    // Perform the action to save the updated value
  };

  if (isEditing) {
    return (
      <FlexDiv>
        <b>{`${field}: `}</b>
        <input
          value={fieldValue}
          onBlur={(e) => handleSaveClick(e.target.value)}
          onChange={(e) => setFieldValue(e.target.value)}
        />
        <SaveOrEditText onClick={(e) => handleSaveClick(e.target.value)}>Save</SaveOrEditText>
      </FlexDiv>
    );
  }

  return (
    <FlexDiv>
      <b>{`${field}: `}</b>
      <p>{value}</p>
      {onEdit && <SaveOrEditText onClick={handleEditClick}>Edit</SaveOrEditText>}
    </FlexDiv>
  );
};

export default PartField;

const FlexDiv = styled.div`
  display: flex;
  // margin: 0px;
  // padding: 0px;
  // add margin to inner children
  & > * {
    margin: 0px 5px 0px 0px;
  }
`;

const SaveOrEditText = styled.div`
  color: blue;
  cursor: pointer;
  font-size: x-small;
`;
