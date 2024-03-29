const express = require('express');
const {Storage} = require('@google-cloud/storage');
const multer = require('multer');
const fileType = require('file-type');
//const cors = require('cors'); // Import the cors middleware ////// to be removed when enaling on server

const app = express();
const port = 8080;

var bodyParser = require('body-parser')
var bodyParser = require('body-parser');
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}))

//app.use(cors()); // Enable CORS for all routes //////// to be removed when enabling on server


// Middleware to handle base64-encoded images
app.use(express.json());  // Parse JSON request bodies
// Add this line to serve our index.html page
app.use(express.static('public'));

const storage = new Storage();
const bucketName = 'deepstream-experiments-comfyui'
const bucket = storage.bucket(bucketName)

app.get('/', (req, res) => {
  res.send('Server is heathy!!');
});

const generateSignedUrl = async (fileName) => {
  // These options will allow temporary read access to the file
  const options = {
    version: 'v2',  // defaults to 'v2' if missing.
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60,  // one hour
  };

  // Get a v2 signed URL for the file
  const [url] =
      await storage.bucket(bucketName).file(fileName).getSignedUrl(options);

  console.log(`The signed url for ${fileName} is ${url}.`);

  return url;
};

app.use('/image', async (req, res, next) => {
  if (req.method === 'PUT' && req.body.image) {
    const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Get file type and extension from base64 data
    const mimeInfo = await fileType.fromBuffer(buffer)
    console.log(mimeInfo);

    // Validate file type
    if (!mimeInfo.mime.startsWith('image/')) {
      return res.status(400).send({message: 'Invalid file type'});
    }
    const filename =
        Date.now() + '.' + mimeInfo.ext;  // Generate a unique filename
    try {
      const folder = 'user_images/'
      const fullFileName = folder + filename;
      const blob = bucket.file(fullFileName);  // Preserve original filename
      blob.save(
          buffer, {
            contentType: mimeInfo.mime,  // Use the content type from the file
          },
          (err) => {
            if (err) {
              return res.status(500).send(
                  {message: 'Error saving image: ' + err});
            }
            generateSignedUrl(fullFileName)
                .then(signedUrl => {
                  res.status(201).send({
                    message: 'Image uploaded successfully',
                    filename,
                    downloadUrl: signedUrl
                  });
                })
                .catch(error => {
                  console.error('Error uploading image:', error);
                  return res.status(500).send(
                      {message: 'Error saving image: ' + error});
                });
          });
    } catch (error) {
      console.error('Error uploading image:', error);
      res.status(500).send('Error uploading image');
    }
  } else {
    next();  // Pass control to subsequent middleware if not a PUT request with
             // image
  }
});

const handleImageUpload = async (buffer, res) => {
  // Get file type and extension from the image data
  const mimeInfo = await fileType.fromBuffer(buffer);

  // Validate file type
  if (!mimeInfo || !mimeInfo.mime.startsWith('image/')) {
    return res.status(400).send({ message: 'Invalid file type' });
  }

  const filename = Date.now() + '.' + mimeInfo.ext; // Generate a unique filename
  const folder = 'user_images/';
  const fullFileName = folder + filename;

  try {
    const blob = bucket.file(fullFileName);
    blob.save(
      buffer,
      {
        contentType: mimeInfo.mime,
      },
      (err) => {
        if (err) {
          return res.status(500).send({ message: 'Error saving image: ' + err });
        }
        generateSignedUrl(fullFileName)
          .then((signedUrl) => {
            res.status(201).send({
              message: 'Image uploaded successfully',
              filename,
              downloadUrl: signedUrl,
            });
          })
          .catch((error) => {
            console.error('Error uploading image:', error);
            return res.status(500).send({ message: 'Error saving image: ' + error });
          });
      }
    );
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).send('Error uploading image');
  }
};

const upload = multer({ storage: multer.memoryStorage() });

app.put('/file_upload_to_gcs', upload.single('fileInput'), async (req, res) => {
  const uploadedFile = req.file.buffer;

  if (!uploadedFile) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  handleImageUpload(uploadedFile, res);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
