import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/services/firebase';
import { refreshParts } from './index';
import { updatePart } from '../../../models/partModel';

export default async (req, res) => {
  switch (req.method) {
    case 'GET':
      try {
        const { partId } = req.query;
        const partSnapshot = await getDoc(doc(db, 'parts', partId));
        if (!partSnapshot.exists()) {
          res.status(404).json({ message: 'Part not found' });
          return;
        }

        let part = partSnapshot.data();

        // // validation
        // part = await refreshParts([part]);
        // if (part.error) {
        //   res.status(400).json({ message: 'Validation failed', errors: part.error });
        //   return;
        // }

        res.status(200).json(part);
      } catch (error) {
        res.status(500).json({ error, message: 'Part get failed' });
      }
      break;

    case 'POST':
      try {
        let part = req?.body && JSON.parse(req.body);
        const { partId } = req.query;

        const updatedPart = updatePart(partId, part);

        await setDoc(docRef, part, { merge: true });

        res.status(201).json({ message: 'Part updated', part });
      } catch (error) {
        res.status(500).json({ error, message: 'Part post failed' });
      }
      break;

    default: // Method Not Allowed
      res.status(405).end();
      break;
  }
};
