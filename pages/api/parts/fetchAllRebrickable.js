const OAuth = require('oauth').OAuth;
import { Blob } from 'buffer';
import { ref, uploadBytes } from 'firebase/storage';
import {
  collection,
  getDocs,
  setDoc,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db, storage } from '../../../logic/firebase';
import { sleep, randomBetween } from '../../../logic/utils';

export default async (req, res) => {
  console.log('FETCH - rebrickable');

  let url =
    'https://rebrickable.com/api/v3/lego/parts?page_size=800&inc_part_details=1';

  while (url) {
    console.log(49015 / 800, url);
    const fetchedData = await fetch(url, {
      headers: {
        Authorization: 'key ' + process.env.NEXT_PUBLIC_REBRICKABLE_KEY,
      },
    });
    const data = await fetchedData.json();

    const batch = writeBatch(db);
    data.results.forEach((part) => {
      if (
        part?.external_ids?.BrickLink &&
        part?.external_ids?.BrickLink.length > 1
      ) {
        console.log('multiple: ', part?.external_ids?.BrickLink);
      }

      let blPartId = part?.external_ids?.BrickLink[0];
      if (blPartId) {
        const dataRef = doc(db, 'parts', blPartId);
        batch.set(dataRef, { rebrickable: part });
      } else {
        console.log('no blPartId');
      }
    });
    await batch.commit();

    url = data.next;

    await sleep(randomBetween(1000, 5000));
  }

  res.status(200).json('success');
};
