const AWS = require('aws-sdk');
require('dotenv').config(); 
// Configure AWS using your .env variables
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1' // Example: "us-east-1"
});
const rekognition = new AWS.Rekognition();
rekognition.listCollections({}, (err, data) => {
    if (err) {
      console.log('Error listing collections:', err);
    } else {
      console.log('Existing collections:', data.CollectionIds);
    }
  });
  

// const createCollectionParams = {
//   CollectionId: 'my-face-collection'
// };

// rekognition.createCollection(createCollectionParams, (err, data) => {
//   if (err) {
//     console.log('Error creating collection:', err);
//   } else {
//     console.log('Collection created:', data);
//   }
// });
