const OAuth = require('oauth').OAuth;

export function fetchBricklinkURL(url) {
  return new Promise((resolve, reject) => {
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
      url,
      process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_VALUE,
      process.env.NEXT_PUBLIC_BRICKLINK_TOKEN_SECRET,
      (error, data, response) => {
        if (error) reject(error);
        const responseObj = JSON.parse(data).data;
        resolve(responseObj);
      }
    );
  });
}
