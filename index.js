const express = require('express');
const {Storage} = require('@google-cloud/storage');
const contentTypeParser = require('content-type-parser');
const fileType = require('file-type');
const mimeTypes = require('mime-types');


const app = express();
const port = 8080;

var bodyParser = require('body-parser')
var bodyParser = require('body-parser');
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}))

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
            // const expires = Date.now() + 3600000;  // Expires in 1 hour
            // const url =
            //     `https://storage.googleapis.com/${bucketName}/${filename}`;
            // const signedUrl = storage.signUrl(url, {
            //   action: 'read',
            //   expires: expires,
            // });
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


// curl -X POST -H "Content-Type: application/json" --data '{"fileURL":"", "destinationPath": "comfyui/output/image"}' http://0.0.0.0:8080/file_url_upload_to_gcs
app.post('/file_url_upload_to_gcs', async (req, res) => {
  try {
    const fileURL = req.body.fileURL;
    const destinationPath = req.body.destFullFilePath;

    // Fetch the file from the provided URL
    const response = await fetch(fileURL);

    if (!response.ok) {
      throw new Error(`Error fetching file: ${response.status}`);
    }

    // Get a ReadableStream from the response
    const contentType = response.headers.get('content-type');
    const extension = mimeTypes.getExtension(contentType);
    const readableStream = response.body;
    const destFullFilePath = `${destinationPath}/${Date.now()}.${extension}`;

    const bucket = storage.bucket(bucketName);
    const fileStream = bucket.file(destFullFilePath).createWriteStream({
      metadata: {
        contentType: contentType, // Use the detected MIME type
      },
    });

    readableStream.pipe(fileStream); // Pipe data to Cloud Storage

    await new Promise((resolve, reject) => {
      fileStream.on('error', reject);
      fileStream.on('finish', resolve);
    });

    const signedUrl = generateSignedUrl(destFullFilePath);
    console.log(`File saved to Google Cloud Storage: ${signedUrl}`);

    res.status(200).json({ success: true, signedUrl });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
