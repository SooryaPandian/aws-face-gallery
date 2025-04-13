// clear.js
const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const rekognition = new AWS.Rekognition();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const COLLECTION_ID = 'my-face-collection';
const TABLE_NAME = 'FaceRecords';


async function deleteAllDynamoItems() {
  try {
    // Scan all items in the table
    const scanResponse = await dynamodb.scan({
      TableName: TABLE_NAME
    }).promise();

    // Batch delete items (DynamoDB has batch write limit of 25 items)
    const batchSize = 25;
    for (let i = 0; i < scanResponse.Items.length; i += batchSize) {
      const batch = scanResponse.Items.slice(i, i + batchSize);
      
      const deleteRequests = batch.map(item => ({
        DeleteRequest: {
          Key: {
            PK: item.PK,
            SK: item.SK
          }
        }
      }));

      await dynamodb.batchWrite({
        RequestItems: {
          [TABLE_NAME]: deleteRequests
        }
      }).promise();
    }

    console.log(`Deleted ${scanResponse.Items.length} items from DynamoDB`);
  } catch (error) {
    console.error('Error deleting items from DynamoDB:', error);
    throw error;
  }
}

async function deleteAllFaces() {
  try {
    // List all faces in the collection
    const listFacesResponse = await rekognition.listFaces({
      CollectionId: COLLECTION_ID,
      MaxResults: 1000
    }).promise();

    // Delete each face
    const deletePromises = listFacesResponse.Faces.map(face => {
      return rekognition.deleteFaces({
        CollectionId: COLLECTION_ID,
        FaceIds: [face.FaceId]
      }).promise();
    });

    await Promise.all(deletePromises);
    console.log(`Deleted ${listFacesResponse.Faces.length} faces from Rekognition collection`);
  } catch (error) {
    console.error('Error deleting faces from Rekognition:', error);
    throw error;
  }
}
async function cleanup() {
  try {
    console.log('Starting cleanup...');
    
    // Delete from Rekognition first
    await deleteAllFaces();
    
    // Then delete from DynamoDB
    await deleteAllDynamoItems();
    
    console.log('Cleanup completed successfully!');
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

// Add the deleteAllFaces and deleteAllDynamoItems functions from above

cleanup();