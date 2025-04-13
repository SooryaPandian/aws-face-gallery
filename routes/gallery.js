const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
// GET /api/faces - returns all unique face IDs
router.get('/faces', async (req, res) => {
    const params = {
      TableName: 'FaceRecords',
      ProjectionExpression: 'SK',
    };
  
    try {
      const result = await dynamodb.scan(params).promise();
      const faceIds = new Set();
  
      result.Items.forEach(item => {
        if (item.SK.startsWith('FACE#')) {
          faceIds.add(item.SK.replace('FACE#', ''));
        }
      });
      console.log('Fetched face IDs:', faceIds);
      res.json({ faceIds: Array.from(faceIds) });
    } catch (err) {
      console.error('Error fetching face IDs:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
router.get('/gallery', async (req, res) => {
  const params = {
    TableName: 'FaceRecords',
    ProjectionExpression: 'PK, SK, s3Url'
  };

  try {
    const result = await dynamodb.scan(params).promise();
    const galleryMap = {};

    result.Items.forEach(item => {
      const imageKey = item.PK.replace('IMAGE#', '');
      const faceId = item.SK.replace('FACE#', '');

      if (!galleryMap[imageKey]) {
        galleryMap[imageKey] = {
          s3Url: item.s3Url,
          faces: []
        };
      }
      galleryMap[imageKey].faces.push(faceId);
    });

    const gallery = Object.values(galleryMap);
    res.json({ gallery });
  } catch (err) {
    console.error('Failed to fetch gallery:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/search/:faceId', async (req, res) => {
  const { faceId } = req.params;

  const params = {
    TableName: 'FaceRecords',
    IndexName: 'SK-index', // You must create this GSI on SK
    KeyConditionExpression: 'SK = :sk',
    ExpressionAttributeValues: {
      ':sk': `FACE#${faceId}`
    }
  };

  try {
    const result = await dynamodb.query(params).promise();
    const images = result.Items.map(item => item.s3Url);
    res.json({ images });
  } catch (err) {
    console.error('Face search failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
