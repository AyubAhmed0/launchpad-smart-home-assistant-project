const express = require('express');
const devicesRouter = require('./routes/devices');
const eventsRouter = require('./routes/events');

const app = express();

app.use(express.json());

// Set up routes
app.use('/devices', devicesRouter);
app.use('/events', eventsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).send('Internal Server Error');
});

module.exports = app;
