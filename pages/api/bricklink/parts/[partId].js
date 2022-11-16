const OAuth = require('oauth').OAuth;
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '../../../../logic/firebase';

const colors = null;

export default (req, res) => {
  // if colors have already been fetched from Firestore
  if (colors) {
    res.status(200).json(colors);
    return;
  }

  // if colors have not been fetched from Firestore
  const { partId } = req.query;
  console.log('FETCH - colors', partId);

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
    `https://api.bricklink.com/api/store/v1/colors`,
    process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_VALUE,
    process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_SECRET,
    async (error, data, response) => {
      if (error) res.status(500).json(error);
      var responseObj = JSON.parse(data);
      console.log(responseObj.data);

      res.status(200).json(responseObj.data);
    }
  );
};

// const batch = writeBatch(db);
// for (let i = 0; i < responseObj.data.length; i++) {
//   const color = responseObj.data[i];
//   console.log(color);
//   const colorRef = doc(db, 'colors', color.color_id.toString());
//   batch.set(colorRef, color);
// }
// await batch.commit();
