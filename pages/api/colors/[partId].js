const OAuth = require('oauth').OAuth;
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../logic/firebase';

const colors = [];

export default async (req, res) => {
  const { partId } = req.query;
  console.log('FETCH - color', partId);

  //  if colors not fetched yet
  if (!colors.length) {
    console.log('FETCH - firestore colors');
    const docs = await getDocs(collection(db, 'bricklink_colors'));
    docs.forEach((doc) => {
      colors.push(doc.data());
    });
  }

  var oauth = new OAuth(
    '',
    '',
    process.env.NEXT_PUBLIC_BRICKLINK_CONSUMER_KEY,
    process.env.NEXT_PUBLIC_BRICKLINK_CONSUMER_SECRET,
    '1.0',
    null,
    'HMAC-SHA1'
  );

  oauth.get(
    `https://api.bricklink.com/api/store/v1/items/PART/${partId}/colors`,
    process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_VALUE,
    process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_SECRET,
    (error, data, response) => {
      if (error) res.status(500).json(error);
      const responseObj = JSON.parse(data).data;
      const knownColorIds = responseObj.map((kc) => kc.color_id);
      const filteredColors = colors.filter((c) =>
        knownColorIds.includes(c.color_id)
      );
      res.status(200).json(filteredColors);
    }
  );
};
