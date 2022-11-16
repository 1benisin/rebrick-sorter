const OAuth = require('oauth').OAuth;
// import { collection, getDocs } from 'firebase/firestore';
// import { db } from '../../../logic/firebase';

export default async (req, res) => {
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
    `https://api.bricklink.com/api/store/v1/items/`,
    process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_VALUE,
    process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_SECRET,
    (error, data, response) => {
      if (error) res.status(500).json(error);
      const resData = JSON.parse(data).data;
      console.log(resData);
      res.status(200).json(resData);
    }
  );
};
