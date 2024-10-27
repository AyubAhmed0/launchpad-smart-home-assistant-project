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

describe('Devices API', () => {
  // Increase Jest timeout if necessary
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Connect Mongoose to the in-memory MongoDB provided by jest-mongodb
    await mongoose.connect(process.env.MONGO_URL);
  });

  afterAll(async () => {
    // Disconnect Mongoose from the in-memory MongoDB
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear the devices collection before each test
    await Device.deleteMany({});
  });

  test('POST /devices/register - should register a new device', async () => {
    const response = await request(app)
      .post('/devices/register')
      .send({
        deviceId: 'test_device_1',
        deviceType: 'light_bulb',
      });

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({ message: 'Device registered successfully.' });

    // Verify the device is saved in the database
    const device = await Device.findOne({ deviceId: 'test_device_1' });
    expect(device).not.toBeNull();
    expect(device.deviceType).toBe('light_bulb');
  });

  test('POST /devices/register - should not register an existing device', async () => {
    // First registration
    await request(app)
      .post('/devices/register')
      .send({
        deviceId: 'test_device_1',
        deviceType: 'light_bulb',
      });

    // Attempt to register the same device again
    const response = await request(app)
      .post('/devices/register')
      .send({
        deviceId: 'test_device_1',
        deviceType: 'light_bulb',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Device already exists.' });
  });

  test('POST /devices/register - should return 400 if deviceId or deviceType is missing', async () => {
    // Missing deviceId
    let response = await request(app)
      .post('/devices/register')
      .send({ deviceType: 'light_bulb' });
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

  test('GET /devices/:deviceId/data - should retrieve device data', async () => {
    // Create a test device with data
    const device = new Device({
      deviceId: 'test_device_1',
      deviceType: 'light_bulb',
      data: { status: 'ON' },
    });
    await device.save();

    const response = await request(app).get('/devices/test_device_1/data');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ON' } });
  });

  test('GET /devices/:deviceId/data - should return 404 for non-existent device', async () => {
    const response = await request(app).get('/devices/nonexistent_device/data');
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: 'Device not found.' });
  });

  test('GET /devices/:deviceId/status - should retrieve device status', async () => {
    // Create a test device with status
    const device = new Device({
      deviceId: 'test_device_1',
      deviceType: 'light_bulb',
      status: 'active',
    });
    await device.save();

    const response = await request(app).get('/devices/test_device_1/status');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'active' });
  });

  test('GET /devices/:deviceId/status - should return 404 for non-existent device', async () => {
    const response = await request(app).get('/devices/nonexistent_device/status');
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: 'Device not found.' });
  });

  test('POST /devices/:deviceId/commands - should send a command to a device', async () => {
    // Create a test device
    const device = new Device({
      deviceId: 'test_device_1',
      deviceType: 'light_bulb',
    });
    await device.save();

    const response = await request(app)
      .post('/devices/test_device_1/commands')
      .send({ command: 'turn_on' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      message: `Command 'turn_on' sent to device test_device_1. Status updated to 'active'.`,
    });

    // Verify that the MQTT client's publish method was called
    const mqttClient = require('../utils/mqttClient');
    expect(mqttClient.publish).toHaveBeenCalledWith(
      `devices/test_device_1/commands`,
      JSON.stringify({ command: 'turn_on' }),
      expect.any(Function)
    );
  });

  test('POST /devices/:deviceId/commands - should return 400 if command is missing', async () => {
    const response = await request(app)
      .post('/devices/test_device_1/commands')
      .send({});
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Command is required.' });
  });

  test('POST /devices/:deviceId/commands - should return 404 if device not found', async () => {
    const response = await request(app)
      .post('/devices/nonexistent_device/commands')
      .send({ command: 'turn_on' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: 'Device not found.' });
  });

  test('POST /devices/:deviceId/commands - should handle MQTT publish error', async () => {
    // Mock the publish method to simulate an error
    const mqttClient = require('../utils/mqttClient');
    mqttClient.publish.mockImplementation((topic, message, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = undefined;
      }
      callback(new Error('Publish failed'));
    });

    // Create a test device
    const device = new Device({
      deviceId: 'test_device_1',
      deviceType: 'light_bulb',
    });
    await device.save();

    const response = await request(app)
      .post('/devices/test_device_1/commands')
      .send({ command: 'turn_on' });

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to send command.' });
  });
});
