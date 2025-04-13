const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config();

const router = express.Router();
const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const COLLECTION_ID = 'my-face-collection';
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const TABLE_NAME = 'FaceRecords';

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const imageKey = `${uuidv4()}${path.extname(file.originalname)}`;
    
    // Upload original image to S3
    await s3.upload({
      Bucket: BUCKET_NAME,
      Key: imageKey,
      Body: file.buffer,
      ContentType: file.mimetype
    }).promise();
    console.log('Image uploaded to S3:', imageKey);
    const s3Url = `https://${BUCKET_NAME}.s3.amazonaws.com/${imageKey}`;
    const timestamp = new Date().toISOString();

    // Detect faces in original image
    const detectParams = {
      Image: { S3Object: { Bucket: BUCKET_NAME, Name: imageKey } },
      Attributes: ['DEFAULT']
    };
    const detectResponse = await rekognition.detectFaces(detectParams).promise();
    const faceDetails = detectResponse.FaceDetails;
    console.log(`Detected ${faceDetails.length} face(s) in image.`);
    const metadata = await sharp(file.buffer).metadata();
    const fileWidth = metadata.width;
    const fileHeight = metadata.height;

    for (const faceDetail of faceDetails) {
      const bbox = faceDetail.BoundingBox;
      const width = Math.floor(bbox.Width * fileWidth);
      const height = Math.floor(bbox.Height * fileHeight);
      const left = Math.floor(bbox.Left * fileWidth);
      const top = Math.floor(bbox.Top * fileHeight);

      // Generate thumbnail
      const thumbnailBuffer = await sharp(file.buffer)
        .extract({ left, top, width, height })
        .toBuffer();

      // Create valid ExternalImageId (remove path and special chars)
      const thumbnailId = uuidv4(); // Just use UUID without path
      const thumbnailKey = `thumbnails/${thumbnailId}.jpg`; // Still store in thumbnails/ in S3

      // Upload thumbnail
      await s3.upload({
        Bucket: BUCKET_NAME,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg'
      }).promise();
      console.log('Thumbnail uploaded to:', thumbnailKey);
      // Search for existing face
      let faceId;
      try {
        const searchResponse = await rekognition.searchFacesByImage({
          CollectionId: COLLECTION_ID,
          Image: { Bytes: thumbnailBuffer },
          FaceMatchThreshold: 90,
          MaxFaces: 1
        }).promise();

        if (searchResponse.FaceMatches.length > 0) {
          faceId = searchResponse.FaceMatches[0].Face.FaceId;
        }
      } catch (error) {
        if (error.code !== 'InvalidParameterException') throw error;
      }

      // Index new face if not found
      if (!faceId) {
        const indexResponse = await rekognition.indexFaces({
          CollectionId: COLLECTION_ID,
          Image: { Bytes: thumbnailBuffer },
          ExternalImageId: thumbnailId, // Use just the UUID without path
          DetectionAttributes: []
        }).promise();
        faceId = indexResponse.FaceRecords[0].Face.FaceId;
      }

      // Store in DynamoDB
      await dynamodb.put({
        TableName: TABLE_NAME,
        Item: {
          PK: `FACE#${faceId}`,
          SK: `IMAGE#${imageKey}`,
          originalImageUrl: s3Url,
          thumbnailUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${thumbnailKey}`,
          thumbnailId: thumbnailId, // Store the clean ID for reference
          timestamp
        }
      }).promise();
    }

    res.json({
      message: 'Image processed successfully',
      faceCount: faceDetails.length,
      imageKey
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;