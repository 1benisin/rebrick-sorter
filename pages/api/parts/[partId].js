import { serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/services/firebase';
import { validatePart } from '../../../models/partModel';

export default async (req, res) => {
  const { partId } = req.query;
  const docRef = doc(db, 'parts', partId);
  const partSnapshot = await getDoc(docRef);

  switch (req.method) {
    case 'GET':
      try {
        if (!partSnapshot.exists()) {
          res.status(404).json({ message: 'Part not found' });
          return;
        }

        // validation
        let part = partSnapshot.data();
        part = await validatePart({ part, forceUpdate: true });
        if (part.error) {
          res.status(400).json({ message: 'Validation failed', errors: part.error });
          return;
        }

        res.status(200).json(part);
      } catch (error) {
        res.status(500).json({ error, message: 'Part get failed' });
      }
      break;

    case 'POST':
      try {
        let part = JSON.parse(req.body);

        part = { ...partSnapshot.data(), ...part };

        part = await validatePart({ part });
        if (part.error) {
          res.status(400).json({ message: 'Validation failed', errors: part.error });
          return;
        }

        await setDoc(docRef, part, { merge: true });

        res.status(201).json({ message: 'Part updated' });
      } catch (error) {
        res.status(500).json({ error, message: 'Part post failed' });
      }
      break;

    default: // Method Not Allowed
      res.status(405).end();
      break;
  }
};
