const express = require('express');
const app = express();
const fileUpload = require('express-fileupload');
const {Storage} = require('@google-cloud/storage');


app.use(
  fileUpload({
      limits: {
          fileSize: 10000000,
      },
      abortOnLimit: true,
  })
);

// Add this line to serve our index.html page
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.put('/image', async (req, res) => {
  // Get the file that was set to our field named "image"
  const { image } = req.files;

  // If no image submitted, exit
  if (!image) {
    console.log('no image selected!');
    return res.sendStatus(400);
  }

  console.log(req.files);
  // image.mv('uploads/' + image.name);

  try {
    const storage = new Storage();
    const bucketName = 'deepstream-experiments-comfyui'
    const bucket = storage.bucket(bucketName)
    const folder = 'user_images/'
    const blob = bucket.file(folder + image.name); // Preserve original filename
    await blob.save(image.data);
    console.log('Image uploaded successfully to GCS:', blob.publicUrl());
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).send('Error uploading image');
  }

  // All good
  res.sendStatus(200);
});

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`helloworld: listening on port ${port}`);
});
