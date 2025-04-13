const express = require('express');
const cors = require('cors');
const uploadRoute = require('./routes/upload1');
require('dotenv').config(); // Load env variables from .env file

const AWS = require('aws-sdk');

// Configure AWS using your .env variables
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1' // Example: "us-east-1"
});

const app = express();
app.use(cors());
app.use(express.json());
app.use('/upload', uploadRoute);
app.use('/gallery',require('./routes/gallery1'));

app.listen(5000, () => console.log('Server running on http://localhost:5000'));
