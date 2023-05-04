import { useState } from 'react';
import styled from 'styled-components';
import { Button } from 'react-bootstrap';
import { db } from '../lib/services/firebase';
import { doc, collection, getDoc, writeBatch } from 'firebase/firestore';

export default function OptomizeBinGridButton(props) {
  const [displayBins, setDisplayBins] = useState([]);

  const printSpiral = (binGrid, sortedArray) => {
    const oldBins = [...sortedArray];
    const newBins = [];
    const createNewBin = (newBin) => {
      const oldBin = oldBins.shift();
      newBins.push({ oldBin: oldBin.index, newBin, count: oldBin.value });
    };

    const numRows = binGrid.length;
    const numCols = binGrid[0].length;
    let topRow = 0,
      bottomRow = numRows - 1;
    let leftCol = 0,
      rightCol = numCols - 1;

    while (topRow <= bottomRow && leftCol <= rightCol) {
      // Print top row
      for (let col = leftCol; col <= rightCol; col++) {
        // console.log(binGrid[topRow][col]);
        createNewBin(binGrid[topRow][col]);
      }
      topRow++;

      // Print right column
      for (let row = topRow; row <= bottomRow; row++) {
        // console.log(binGrid[row][rightCol]);
        createNewBin(binGrid[row][rightCol]);
      }
      rightCol--;

      // Print bottom row
      if (topRow <= bottomRow) {
        for (let col = rightCol; col >= leftCol; col--) {
          // console.log(binGrid[bottomRow][col]);
          createNewBin(binGrid[bottomRow][col]);
        }
        bottomRow--;
      }

      // Print left column
      if (leftCol <= rightCol) {
        for (let row = bottomRow; row >= topRow; row--) {
          // console.log(binGrid[row][leftCol]);
          createNewBin(binGrid[row][leftCol]);
        }
        leftCol++;
      }
    }
    return newBins;
  };

  const rearrangeGrid = (grid) => {
    const size = grid.length;
    const center = Math.floor(size / 2);
    const halfSize = size / 2;

    // create a new 2d array filled with zeroes
    const newGrid = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
    console.log('empty', newGrid);

    // sort the values in the grid
    const sortedValues = grid.flat().sort((a, b) => a - b);
    console.log('sortedValues', sortedValues);

    // fill the new grid with the sorted values
    let index = 0;
    for (let i = 0; i < halfSize; i++) {
      for (let j = i; j < size - i; j++) {
        newGrid[i][j] = sortedValues[index++];
      }
      for (let j = i + 1; j < size - i; j++) {
        newGrid[j][size - i - 1] = sortedValues[index++];
      }
      for (let j = size - i - 2; j >= i; j--) {
        newGrid[size - i - 1][j] = sortedValues[index++];
      }
      for (let j = size - i - 2; j > i; j--) {
        newGrid[j][i] = sortedValues[index++];
      }
    }

    // handle the center row/column for even-sized grids
    if (size % 2 === 0) {
      for (let i = 0; i < halfSize; i++) {
        newGrid[center - 1][i] = sortedValues[index++];
        newGrid[center][size - i - 1] = sortedValues[index++];
        newGrid[center][i] = sortedValues[index++];
        newGrid[center - 1][size - i - 1] = sortedValues[index++];
      }
    }

    return newGrid;
  };

  const createRandomNumGrid = (size) => {
    let arrays = [];
    for (let i = 0; i < size; i++) {
      let arr = [];
      for (let j = 0; j < size; j++) {
        arr.push(Math.floor(Math.random() * 100) + 1); // generates a random number between 1 and 100 (inclusive)
      }
      arrays.push(arr);
    }
    return arrays;
  };

  const onClick = async () => {
    const binGrid = [];
    let counter = 1;

    for (let i = 0; i < 16; i++) {
      const row = [];

      for (let j = 0; j < 16; j++) {
        row.push(counter);
        counter++;
      }

      binGrid.push(row);
    }

    // import json file data from public folder labels.json
    let labels = await import('../public/labels.json');
    labels = labels.default;
    console.log('labels', labels);

    // get sorter0BinCounts from settings collection conveyor1 document on firebase db
    const data = await getDoc(doc(db, 'settings', 'conveyor1'));
    let { sorter1BinCounts, sorter0BinCounts } = data.data();

    // convert sorter1BinCounts to an array of abjects containing there index and value
    let sortCounts = sorter1BinCounts.map((value, index) => {
      return { index: index + 1, value };
    });

    let sortedValues = sortCounts.sort((a, b) => a.value - b.value);

    const result = printSpiral(binGrid, sortedValues);
    console.log('result', result);

    // convert results into a block of text with a new line after each element of the array. stringify the array to remove the brackets
    setDisplayBins(result);

    labels = labels.map((label) => {
      if (label[2] == 1)
        return [label[0], label[1], label[2], result.find((bin) => bin.oldBin == label[3]).newBin];
      return label;
    });
    console.log('labels', labels);

    // resave labels as a json file in the public folder named newLabels.json
    const json = JSON.stringify(labels);
    const blob = new Blob([json], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'newLabels.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Container>
      <ButtonStyled onClick={onClick} size="sm" {...props}>
        Test
      </ButtonStyled>
      {displayBins &&
        displayBins.map((bin) => <p>{`${bin.oldBin} => ${bin.newBin} ____count: ${bin.count}`}</p>)}
    </Container>
  );
}

const ButtonStyled = styled(Button)`
  margin: auto 5px;
`;
const Container = styled.div`
  // display: flex;
`;

const Username = styled.p`
  margin: auto;
  font-size: small;
  color: grey;
`;
