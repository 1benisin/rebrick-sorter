import styled from 'styled-components';
import React, { useState } from 'react';

const PartDetail = ({ field, value }) => {
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
      <SaveOrEditText onClick={handleEditClick}>Edit</SaveOrEditText>
    </FlexDiv>
  );
};

export default PartDetail;

const FlexDiv = styled.div`
  display: flex;
  margin: 5px;
  // add margin to inner children
  & > * {
    margin-right: 5px;
  }
`;

const SaveOrEditText = styled.div`
  color: blue;
  cursor: pointer;
  font-size: x-small;
`;
