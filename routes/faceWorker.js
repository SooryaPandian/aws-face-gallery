const { parentPort, workerData } = require('worker_threads');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const processFaceDetection = async () => {
  try {
    const { imageBuffer, imageKey, s3Url, timestamp, bucketName, collectionId, tableName } = workerData;
    const buffer = Buffer.from(imageBuffer, 'base64');
    
    const rekognition = new AWS.Rekognition();
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const s3 = new AWS.S3();

    // Detect faces
    const detectParams = {
      Image: { Bytes: buffer },
      Attributes: ['DEFAULT']
    };
    const detectResponse = await rekognition.detectFaces(detectParams).promise();
    const faceDetails = detectResponse.FaceDetails;

    const metadata = await sharp(buffer).metadata();
    const fileWidth = metadata.width;
    const fileHeight = metadata.height;

    for (const faceDetail of faceDetails) {
      const bbox = faceDetail.BoundingBox;
      const width = Math.floor(bbox.Width * fileWidth);
      const height = Math.floor(bbox.Height * fileHeight);
      const left = Math.floor(bbox.Left * fileWidth);
      const top = Math.floor(bbox.Top * fileHeight);

      // Generate thumbnail
      const thumbnailBuffer = await sharp(buffer)
        .extract({ left, top, width, height })
        .toBuffer();

      const thumbnailId = uuidv4();
      const thumbnailKey = `thumbnails/${thumbnailId}.jpg`;

      // Upload thumbnail
      await s3.upload({
        Bucket: bucketName,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg'
      }).promise();

      // Face matching and indexing
      let faceId;
      try {
        const searchResponse = await rekognition.searchFacesByImage({
          CollectionId: collectionId,
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

      if (!faceId) {
        const indexResponse = await rekognition.indexFaces({
          CollectionId: collectionId,
          Image: { Bytes: thumbnailBuffer },
          ExternalImageId: thumbnailId,
          DetectionAttributes: []
        }).promise();
        faceId = indexResponse.FaceRecords[0].Face.FaceId;
      }

      // Store in DynamoDB
      await dynamodb.put({
        TableName: tableName,
        Item: {
          PK: `FACE#${faceId}`,
          SK: `IMAGE#${imageKey}`,
          originalImageUrl: s3Url,
          thumbnailUrl: `https://${bucketName}.s3.amazonaws.com/${thumbnailKey}`,
          thumbnailId,
          timestamp
        }
      }).promise();
    }

    parentPort.postMessage({
      imageKey,
      faceCount: faceDetails.length,
      status: 'processed'
    });

  } catch (error) {
    parentPort.postMessage({
      error: error.message,
      status: 'failed'
    });
  }
};

processFaceDetection();