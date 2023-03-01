const OAuth = require('oauth').OAuth;
import { decodeHTML } from '../utils';
const fs = require('fs');
const xml2js = require('xml2js');

let categories = null;

const readXML = (fileURL) => {
  return new Promise((resolve, reject) => {
    fs.readFile(fileURL, (err, data) => {
      if (err) {
        reject(err);
      } else {
        xml2js.parseString(data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result.CATALOG.ITEM);
          }
        });
      }
    });
  });
};

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

    if (!categories) {
      try {
        let xmlCategories = await readXML(process.cwd() + '/public/bricklink_data/categories.xml');
        // reformat xmlParts array
        categories = xmlCategories.map((item) => ({
          name: item.CATEGORYNAME[0],
          id: item.CATEGORY[0],
        }));
      } catch (error) {
        console.log('ISSUE SPICING XML', error);
      }
    }

    const catName = categories.find((cat) => cat.id == blPart.category_id)?.name;

    let formattedBlPart = {
      timestamp: Date.now(),
      id: blPart.no,
      name: blPart.name ? decodeHTML(blPart.name) : null,
      type: blPart.type ? blPart.type : null,
      catId: blPart.category_id ? parseInt(blPart.category_id) : null,
      catName: catName ? catName : null,
      altIds: blPart.alternate_item_no ? blPart.alternate_item_no : null,
      imageUrl: blPart.image_url ? `https:${blPart.image_url}` : null,
      thumbnailUrl: blPart.thumbnail_url ? `https:${blPart.thumbnail_url}` : null,
      weight: blPart.weight ? blPart.weight : null,
      dimX: blPart.dim_x ? blPart.dim_x : null,
      dimY: blPart.dim_y ? blPart.dim_y : null,
      dimZ: blPart.dim_z ? blPart.dim_z : null,
      yearReleased: blPart.year_released ? blPart.year_released : null,
      description: blPart.description ? blPart.description : null,
      isObsolete: blPart.is_obsolete ? blPart.is_obsolete : null,
      languageCode: blPart.language_code ? blPart.language_code : null,
    };

    // remove null values from formattedBlPart
    formattedBlPart = Object.keys(formattedBlPart).reduce((acc, key) => {
      if (formattedBlPart[key] !== null) acc[key] = formattedBlPart[key];
      return acc;
    }, {});

    return formattedBlPart;
  } catch (error) {
    console.error(
      `Error fetching Bricklink part data for part ${partId}. Error: ${JSON.stringify(error)}`
    );
    return { error };
  }
};
