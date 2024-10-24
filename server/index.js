const express = require('express');
const app = require('./app');
const mongoose = require('mongoose');
const {
  httpRequestDurationMicroseconds,
  promClient,
} = require('./metrics');

const port = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/smarthome';

// Middleware to measure HTTP request durations
app.use((req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const durationInSeconds = seconds + nanoseconds / 1e9;
    httpRequestDurationMicroseconds
      .labels(req.method, req.path, res.statusCode)
      .observe(durationInSeconds);
  });

  next();
});

app.use(express.json());

// Root route for health check
app.get('/', (req, res) => {
  console.log('Received GET request at /');
  res.status(200).send('Server is running');
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).send('Internal Server Error');
});

// Ensure the database connection is established before starting the server
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');

    // Start the server after successful DB connection
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => console.error('Failed to connect to MongoDB', err));
