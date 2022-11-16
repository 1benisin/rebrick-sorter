import { splitArrayIntoGroups, sleep } from '../../logic/utils';
const fs = require('fs');
import { writeBatch, doc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../logic/firebase';

export default async (req, res) => {
  // // get all parts
  // const parts = [];
  // const docs = await getDocs(collection(db, 'parts'));
  // // const docs = await getDocs(query(collection(db, 'parts'), limit(10000)));
  // docs.forEach((doc) => {
  //   parts.push(doc.data());
  // });

  // // create word arrays
  // const wordArrays = parts.map((p) => [
  //   p.partId,
  //   new Set(p.partName.split(' ')),
  // ]);

  // // split word arrays into groups of max 1000
  // const groupCount = wordArrays.length / 1000;
  // const wordArrayGroups = splitArrayIntoGroups([...wordArrays], groupCount);

  // // create and save json file for each group
  // for (let index = 0; index < wordArrayGroups.length; index++) {
  //   const group = wordArrayGroups[index];

  //   const relations = {};
  //   const startTime = Date.now();

  //   // for each part in group
  //   for (let i = 0; i < group.length; i++) {
  //     const [partId, title] = group[i];

  //     const partTitleSimilarity = [];

  //     // for every part in catalog
  //     for (const [otherPartId, otherTitle] of wordArrays) {
  //       // find strength of titles relationship
  //       let titleOverlapStrength = 0;
  //       for (const word of title) {
  //         if (otherTitle.has(word)) {
  //           titleOverlapStrength++;
  //         }
  //       }
  //       // if title overlap strength is greater than 1 & partId is not the same as otherPartId
  //       titleOverlapStrength > 1 &&
  //         partId != otherPartId &&
  //         partTitleSimilarity.push({
  //           partId: otherPartId,
  //           strength: titleOverlapStrength,
  //         });
  //     }

  //     const top10Similar = partTitleSimilarity
  //       .sort((a, b) => b.strength - a.strength)
  //       .slice(0, 10)
  //       .map((p) => p.partId);

  //     relations[partId] = top10Similar;
  //     console.log('part', partId, title);

  //     // console log progress every 100 iterations
  //     if (i % 100 === 0) {
  //       const now = Date.now();
  //       const timeElapsed = now - startTime;
  //       const completed = Object.keys(relations).length;
  //       const total = Object.keys(wordArrays).length;
  //       const remainingTime = (timeElapsed / completed) * (total - completed);
  //       // give round minutes reamaining
  //       const minutesRemaining = Math.round(remainingTime / 1000 / 60);
  //       const minutesElapsed = Math.round(timeElapsed / 1000 / 60);
  //       console.log(
  //         index,
  //         '/',
  //         wordArrayGroups.length,
  //         'groups',
  //         minutesElapsed,
  //         '/',
  //         minutesRemaining,
  //         'min'
  //       );
  //     }
  //   }

  //   // save data to json file
  //   const jsonData = JSON.stringify(relations);
  //   fs.writeFileSync(
  //     process.cwd() + `/public/partNameRelationship/group_${index}.json`,
  //     jsonData
  //   );
  // }

  // --------------------------------------------
  // // get all relationship files
  // const dir = process.cwd() + '/public/partNameRelationship/';
  // const listFiles = await fs.readdirSync(dir);
  // console.log(listFiles);

  // let relationObj = {};
  // for (const fileName of listFiles) {
  //   // READ JSON FILE
  //   const data = fs.readFileSync(dir + fileName);
  //   const obj = JSON.parse(data);
  //   relationObj = { ...relationObj, ...obj };
  // }
  // // save data to json file
  // const jsonData = JSON.stringify(relationObj);
  // fs.writeFileSync(
  //   process.cwd() + `/public/partNameRelationships.json`,
  //   jsonData
  // );

  // -----------------------------
  // upload each relation in batches to DB
  const data = fs.readFileSync(
    process.cwd() + `/public/partNameRelationships.json`
  );
  const nameRelations = JSON.parse(data);

  const partIds = [];
  const docs = await getDocs(collection(db, 'part_details'));
  // const docs = await getDocs(query(collection(db, 'partIds'), limit(10)));
  docs.forEach((doc) => {
    partIds.push(doc.id);
  });

  const numGroups = partIds.length / 400;
  const partIdGroups = splitArrayIntoGroups(partIds, numGroups);
  let logcount = 0;
  for (const partIdGroup of partIdGroups) {
    const batch = writeBatch(db);

    partIdGroup.forEach(
      (id) =>
        nameRelations[id] &&
        batch.update(doc(db, 'part_details', id), {
          name_relation: nameRelations[id],
        })
    );

    await batch.commit();

    await sleep(1000);
    console.log(logcount++, '/', partIdGroups.length, 'groups');
  }

  console.log(`relations uploaded`);

  console.log('done');
  res.status(200).json('done');
};

// function splitArrayIntoGroups(array, parts) {
//   const numberOfParts = Math.ceil(parts); // prevents decimal numbers
//   let result = [];
//   for (let i = numberOfParts; i > 0; i--) {
//     result.push(array.splice(0, Math.ceil(array.length / i)));
//   }
//   return result;
// }
