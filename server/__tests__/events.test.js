/* eslint-disable no-undef */
const request = require('supertest');
const app = require('../app');
const Device = require('../models/device');
const mongoose = require('mongoose');

// Mock the MQTT client
jest.mock('../utils/mqttClient', () => ({
  publish: jest.fn((topic, message, options, callback) => {
    // Adjust arguments if options are omitted
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    if (callback) callback(null);
  }),
  subscribe: jest.fn(),
  on: jest.fn(),
}));

describe('Events API', () => {
  // Increase Jest timeout if necessary (default is 5000 ms)
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Connect Mongoose to the in-memory MongoDB
    await mongoose.connect(process.env.MONGO_URL);
  });

  afterAll(async () => {
    // Disconnect Mongoose from the in-memory MongoDB
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear the devices collection before each test to ensure test isolation
    await Device.deleteMany({});
  });

  test('POST /events/publish - should publish an event to a registered device', async () => {
    // Register a test device
    const device = new Device({
      deviceId: 'test_device_1',
      deviceType: 'test_type',
    });
    await device.save();

    const response = await request(app)
      .post('/events/publish')
      .send({
        topic: 'devices/test_device_1/data',
        message: { status: 'ON' },
      });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: 'Event published successfully.' });

    // Verify that the MQTT client's publish method was called
    const mqttClient = require('../utils/mqttClient');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      'devices/test_device_1/data',
      JSON.stringify({ status: 'ON' }),
      expect.any(Function)
    );
  });

  test('POST /events/publish - should not publish an event to an unregistered device', async () => {
    const response = await request(app)
      .post('/events/publish')
      .send({
        topic: 'devices/unregistered_device/data',
        message: { status: 'ON' },
      });

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Device unregistered_device not registered.' });
  });

  test('POST /events/publish - should require topic and message', async () => {
    const response = await request(app)
      .post('/events/publish')
      .send({});

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'topic and message are required.' });
  });

  test('POST /devices/register - should return 400 if deviceId or deviceType is missing', async () => {
    // Missing deviceId
    let response = await request(app)
      .post('/devices/register')
      .send({ deviceType: 'test_type' });
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'deviceId and deviceType are required.' });

    // Missing deviceType
    response = await request(app)
      .post('/devices/register')
      .send({ deviceId: 'test_device_1' });
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'deviceId and deviceType are required.' });
  });

  test('POST /devices/register - should return 400 for invalid deviceType', async () => {
    const response = await request(app)
      .post('/devices/register')
      .send({
        deviceId: 'test_device_1',
        deviceType: 'invalid_type',
      });
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid deviceType.' });
  });

  test('GET /devices/:deviceId/data - should return 404 for non-existent device', async () => {
    const response = await request(app).get('/devices/nonexistent_device/data');
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: 'Device not found.' });
  });

  test('POST /events/publish - should return 400 for invalid topic format', async () => {
    const response = await request(app)
      .post('/events/publish')
      .send({
        topic: 'invalid_topic',
        message: { status: 'ON' },
      });
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid topic format.' });
  });

  test('POST /devices/:deviceId/commands - should handle MQTT publish error', async () => {
    // Ensure the device exists before sending the command
    const device = new Device({
      deviceId: 'test_device_1',
      deviceType: 'light_bulb',
    });
    await device.save();

    // Mock the publish method to simulate an error
    const mqttClient = require('../utils/mqttClient');
    mqttClient.publish.mockImplementation((topic, message, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = undefined;
      }
      callback(new Error('Publish failed'));
    });

    const response = await request(app)
      .post('/devices/test_device_1/commands')
      .send({ command: 'turn_on' });

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to send command.' });
  });
});
