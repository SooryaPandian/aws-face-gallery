const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config(); // Load env variables from .env file
const router = express.Router();
const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Config
const COLLECTION_ID = 'my-face-collection';
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
console.log('BUCKET_NAME:', BUCKET_NAME); // Debugging line to check bucket name
const TABLE_NAME = 'FaceRecords';
// Set up multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload endpoint (single image)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const imageKey = `${uuidv4()}${path.extname(file.originalname)}`;
    const s3Params = {
      Bucket: BUCKET_NAME,
      Key: imageKey,
      Body: file.buffer,
      ContentType: file.mimetype
    };

    console.log('Uploading image to S3...');
    await s3.upload(s3Params).promise();
    const s3Url = `https://${BUCKET_NAME}.s3.amazonaws.com/${imageKey}`;
    console.log('Image uploaded to:', s3Url);

    // Call Rekognition to index faces
    const rekognitionParams = {
      CollectionId: COLLECTION_ID,
      Image: { S3Object: { Bucket: BUCKET_NAME, Name: imageKey } },
      ExternalImageId: imageKey,
      DetectionAttributes: []
    };

    console.log('Indexing faces with Rekognition...');
    const rekognitionResponse = await rekognition.indexFaces(rekognitionParams).promise();
    const faceRecords = rekognitionResponse.FaceRecords;

    console.log(`Detected ${faceRecords.length} face(s) in image.`);

    const timestamp = new Date().toISOString();

    // Map each face to this image in DynamoDB
    for (const record of faceRecords) {
      const faceId = record.Face.FaceId;
      const dbParams = {
        TableName: TABLE_NAME,
        Item: {
          PK: `FACE#${faceId}`,
          SK: `IMAGE#${imageKey}`,
          s3Url: s3Url,
          timestamp: timestamp
        }
      };
      console.log(`Saving mapping for Face ID ${faceId} -> Image ${imageKey}`);
      await dynamodb.put(dbParams).promise();
    }

    res.json({
      message: 'Image uploaded and faces indexed successfully.',
      imageKey,
      faceCount: faceRecords.length
    });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
