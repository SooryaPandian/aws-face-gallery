const express = require('express');
const AWS = require('aws-sdk');
require('dotenv').config();

const router = express.Router();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const rekognition = new AWS.Rekognition();

const TABLE_NAME = 'FaceRecords';
const COLLECTION_ID = 'my-face-collection';
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// 1. Get all stored images
router.get('/images', async (req, res) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': 'IMAGE#'
      },
      ProjectionExpression: 'SK, originalImageUrl, #ts',
      ExpressionAttributeNames: {
        '#ts': 'timestamp'
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    // Process results
    const images = result.Items.map(item => ({
      imageKey: item.SK.replace('IMAGE#', ''),
      url: item.originalImageUrl,
      timestamp: item.timestamp || item['#ts']
    }));

    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ 
      error: 'Failed to fetch images',
      details: error.message
    });
  }
});


// 2. Get all unique faces (for face gallery view)
router.get('/faces', async (req, res) => {
  try {
    // Get list of faces from Rekognition collection
    const rekognitionParams = {
      CollectionId: COLLECTION_ID,
      MaxResults: 1000
    };

    const faceData = await rekognition.listFaces(rekognitionParams).promise();
    
    // For each face, get one thumbnail and count of images
    const faces = await Promise.all(
      faceData.Faces.map(async (face) => {
        // Get one record for this face to find a thumbnail
        const dbParams = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :faceId',
          ExpressionAttributeValues: {
            ':faceId': `FACE#${face.FaceId}`
          },
          Limit: 1
        };

        const dbResult = await dynamodb.query(dbParams).promise();
        const thumbnailUrl = dbResult.Items[0]?.thumbnailUrl || null;

        // Get count of images for this face
        const countParams = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :faceId',
          ExpressionAttributeValues: {
            ':faceId': `FACE#${face.FaceId}`
          },
          Select: 'COUNT'
        };

        const countResult = await dynamodb.query(countParams).promise();

        return {
          faceId: face.FaceId,
          thumbnailUrl,
          imageCount: countResult.Count,
          externalImageId: face.ExternalImageId
        };
      })
    );

    res.json(faces);
  } catch (error) {
    console.error('Error fetching faces:', error);
    res.status(500).json({ error: 'Failed to fetch faces' });
  }
});

// 3. Get all images for a specific face
router.get('/faces/:faceId/images', async (req, res) => {
  try {
    const { faceId } = req.params;

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :faceId',
      ExpressionAttributeValues: {
        ':faceId': `FACE#${faceId}`
      }
    };

    const result = await dynamodb.query(params).promise();
    
    const images = result.Items.map(item => ({
      imageKey: item.SK.replace('IMAGE#', ''),
      url: item.originalImageUrl,
      timestamp: item.timestamp
    }));

    res.json(images);
  } catch (error) {
    console.error('Error fetching face images:', error);
    res.status(500).json({ error: 'Failed to fetch face images' });
  }
});

// 4. Get faces present in a specific image
router.get('/images/:imageKey/faces', async (req, res) => {
  try {
    const { imageKey } = req.params;

    // First detect faces in the image
    const detectParams = {
      Image: {
        S3Object: {
          Bucket: BUCKET_NAME,
          Name: imageKey
        }
      }
    };

    const detectionResult = await rekognition.detectFaces(detectParams).promise();
    
    // For each face, try to match with known faces
    const faces = await Promise.all(
      detectionResult.FaceDetails.map(async (face) => {
        // Get face thumbnail from original image
        const searchParams = {
          CollectionId: COLLECTION_ID,
          Image: {
            S3Object: {
              Bucket: BUCKET_NAME,
              Name: imageKey
            }
          },
          FaceMatchThreshold: 90,
          MaxFaces: 1
        };

        try {
          const searchResult = await rekognition.searchFacesByImage(searchParams).promise();
          
          if (searchResult.FaceMatches.length > 0) {
            const matchedFace = searchResult.FaceMatches[0].Face;
            
            // Get thumbnail URL from DynamoDB
            const dbParams = {
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :faceId AND begins_with(SK, :imagePrefix)',
              ExpressionAttributeValues: {
                ':faceId': `FACE#${matchedFace.FaceId}`,
                ':imagePrefix': 'IMAGE#'
              },
              Limit: 1
            };

            const dbResult = await dynamodb.query(dbParams).promise();
            
            return {
              faceId: matchedFace.FaceId,
              confidence: searchResult.FaceMatches[0].Similarity,
              thumbnailUrl: dbResult.Items[0]?.thumbnailUrl || null,
              boundingBox: face.BoundingBox
            };
          }
        } catch (error) {
          console.error('Error searching face:', error);
        }

        return {
          faceId: null, // Unknown face
          boundingBox: face.BoundingBox
        };
      })
    );

    res.json(faces.filter(face => face !== null));
  } catch (error) {
    console.error('Error fetching image faces:', error);
    res.status(500).json({ error: 'Failed to fetch image faces' });
  }
});

module.exports = router;