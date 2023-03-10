import FormData from 'form-data';

// expects    __________
// const imageData = canvas.toDataURL('image/png');
// fetch('/api/brickognize', {
//   method: 'POST',
//   body: JSON.stringify({ imageData }),
// })

export default async (req, res) => {
  try {
    const { imageData } = JSON.parse(req.body);

    // create buffer from base64 string
    console.log(imageData.split(',')[1].slice(0, 100));
    const fileData = Buffer.from(imageData.split(',')[1], 'base64');

    let formData = new FormData();
    formData.append('query_image', fileData, {
      filename: 'query_image.png',
      contentType: 'image/png',
    });

    const response = await fetch('https://api.brickognize.com/predict/', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    console.log('sdj4', data);
    res.status(200).json(data);
  } catch (error) {
    console.log('blad', error);
    res.status(422).json({ error: error.message });
  }
};
