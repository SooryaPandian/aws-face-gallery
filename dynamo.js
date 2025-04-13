    const AWS = require('aws-sdk');
    require('dotenv').config(); 
    // Configure AWS using your .env variables
    AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1' // Example: "us-east-1"
    });
    const dynamodb = new AWS.DynamoDB();
    const params = {
        TableName: 'FaceRecords',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'timestamp', AttributeType: 'S' } // Add this for GSI
        ],
        GlobalSecondaryIndexes: [{
          IndexName: 'ImagesByTimestamp',
          KeySchema: [
            { AttributeName: 'SK', KeyType: 'HASH' },
            { AttributeName: 'timestamp', KeyType: 'RANGE' }
          ],
          Projection: {
            ProjectionType: 'ALL'
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        }],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      };
      
      dynamodb.createTable(params, (err, data) => {
        if (err) {
          if (err.code === 'ResourceInUseException') {
            console.log('Table already exists');
          } else {
            console.error("Error creating table:", err);
          }
        } else {
          console.log("Table created successfully:", data);
        }
      });