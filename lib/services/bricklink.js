const OAuth = require('oauth').OAuth;
import { decodeHTML } from '../utils';

function fetchBricklinkURL(url) {
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
        const responseObj = JSON.parse(data).data;
        // bricklink api returns empty object if part not found
        if (Object.keys(responseObj).length === 0) reject('Bricklink API returned empty object');

        resolve(responseObj);
      }
    );
  });
}

export const getBricklinkPart = async (partId) => {
  try {
    const url = `https://api.bricklink.com/api/store/v1/items/part/${partId}`;
    const blPart = await fetchBricklinkURL(url);

    blPart.timestamp = Date.now();
    blPart.id = blPart.no;
    delete blPart.no;

    // normalize data
    if (blPart.name) blPart.name = decodeHTML(blPart.name);
    if (blPart.image_url) blPart.image_url = `https:${blPart.image_url}`;
    if (blPart.thumbnail_url) blPart.thumbnail_url = `https:${blPart.thumbnail_url}`;

    return blPart;
  } catch (error) {
    console.error(
      `Error fetching Bricklink part data for part ${partId}. Error: ${JSON.stringify(error)}`
    );
    return { error };
  }
};
