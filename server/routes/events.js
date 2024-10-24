const express = require('express');
const router = express.Router();
const mqttClient = require('../utils/mqttClient');
const Device = require('../models/device');
const {
  totalEventsPublished,
} = require('../metrics');

// Publish an event (User-initiated)
router.post('/publish', async (req, res) => {
  const { topic, message } = req.body;

  if (!topic || !message) {
    return res.status(400).json({ error: 'topic and message are required.' });
  }

  // Validate topic format
  const validTopicPattern = /^(devices|events)\/[a-zA-Z0-9_]+(\/[a-zA-Z0-9_]+)*$/;
  if (!validTopicPattern.test(topic)) {
    return res.status(400).json({ error: 'Invalid topic format.' });
  }

  // Extract deviceId from the topic if it's a device-specific topic
  let deviceId;
  const topicParts = topic.split('/');
  if (topicParts[0] === 'devices' && topicParts[1]) {
    deviceId = topicParts[1];
  }

  // If a deviceId is extracted, check if the device exists
  if (deviceId) {
    try {
      const deviceExists = await Device.exists({ deviceId });
      if (!deviceExists) {
        return res.status(400).json({ error: `Device ${deviceId} not registered.` });
      }
    } catch (err) {
      console.error('Failed to check device existence:', err);
      return res.status(500).json({ error: 'Failed to publish event.' });
    }
  }

  try {
    mqttClient.publish(topic, JSON.stringify(message), (err) => {
      if (err) {
        console.error('Failed to publish event:', err);
        return res.status(500).json({ error: 'Failed to publish event.' });
      } else {
        console.log(`Event published to topic ${topic}`);
        totalEventsPublished.inc(); // Increment the events published counter
        return res.status(200).json({ message: 'Event published successfully.' });
      }
    });
  } catch (error) {
    console.error('Failed to publish event:', error);
    res.status(500).json({ error: 'Failed to publish event.' });
  }
});

// Subscribe to events (User-initiated)
router.get('/subscribe', (req, res) => {
  const { topics } = req.query;

  if (!topics) {
    return res.status(400).json({ error: 'topics query parameter is required.' });
  }

  const topicsArray = topics.split(',');

  // Set headers for SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  console.log(`User subscribed to topics: ${topicsArray.join(', ')}`);

  // Function to handle incoming MQTT messages
  const handleMessage = (topic, message) => {
    if (topicsArray.includes(topic)) {
      res.write(`data: ${JSON.stringify({ topic, message: message.toString() })}\n\n`);
    }
  };

  // Subscribe to the requested topics
  mqttClient.subscribe(topicsArray, { qos: 1 }, (err) => {
    if (err) {
      console.error('Failed to subscribe to topics:', err.message);
    } else {
      console.log(`Subscribed to topics: ${topicsArray.join(', ')}`);
    }
  });

  // Attach the message handler
  mqttClient.on('message', handleMessage);

  // Handle client disconnect
  req.on('close', () => {
    console.log('User disconnected from SSE');
    mqttClient.removeListener('message', handleMessage);
    // Unsubscribe from topics
    mqttClient.unsubscribe(topicsArray, (err) => {
      if (err) {
        console.error('Failed to unsubscribe from topics:', err.message);
      } else {
        console.log(`Unsubscribed from topics: ${topicsArray.join(', ')}`);
      }
    });
  });
});

module.exports = router;
