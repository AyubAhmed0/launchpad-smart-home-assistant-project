const mqtt = require('mqtt');
const Device = require('../models/device'); 

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883';

// Initialise MQTT client but prevent it from connecting immediately
const mqttClient = mqtt.connect(MQTT_BROKER_URL, { reconnectPeriod: 1000 });

function setupMqttClient() {
  // Set up MQTT client event handlers
  mqttClient.on('connect', () => {
    console.log('Server connected to MQTT broker');

    // Subscribe to device registration events
    mqttClient.subscribe('devices/register', { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to subscribe to devices/register:', err.message);
      } else {
        console.log('Subscribed to devices/register');
      }
    });

    // Subscribe to high energy usage events
    mqttClient.subscribe('events/high_energy_usage', { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to subscribe to events/high_energy_usage:', err.message);
      } else {
        console.log('Subscribed to events/high_energy_usage');
      }
    });

    // Subscribe to device data topics
    mqttClient.subscribe('devices/+/data', { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to subscribe to devices/+/data:', err.message);
      } else {
        console.log('Subscribed to devices/+/data');
      }
    });
  });

  mqttClient.on('error', (error) => {
    console.error('MQTT client error:', error);
  });

  // Handle incoming MQTT messages
  mqttClient.on('message', async (topic, message) => {
    console.log(`Received message on topic ${topic}: ${message.toString()}`);
    const msg = JSON.parse(message.toString());

    if (topic === 'devices/register') {
      // Handle device registration
      const { deviceId, deviceType } = msg;
      try {
        let device = await Device.findOne({ deviceId });
        if (device) {
          device.deviceType = deviceType;
          await device.save();
          console.log(`Device ${deviceId} already registered and updated in the database.`);
        } else {
          device = new Device({ deviceId, deviceType });
          await device.save();
          console.log(`Device ${deviceId} registered and saved to the database.`);
        }
      } catch (error) {
        console.error('Device registration failed:', error);
      }
    } else if (topic === 'events/high_energy_usage') {
      // Handle high energy usage event
      console.log('High energy usage event received:', msg);

      // Send command to turn off light bulb
      const command = {
        command: 'turn_off',
      };

      // Publish command to light bulb
      mqttClient.publish('devices/light_bulb_1/commands', JSON.stringify(command));
      console.log('Command sent to light bulb to turn off');
    } else if (topic.startsWith('devices/') && topic.endsWith('/data')) {
      // Handle device data messages
      const deviceId = topic.split('/')[1];
      try {
        const device = await Device.findOne({ deviceId });
        if (device) {
          device.data = msg;
          // Update status based on data
          if (device.deviceType === 'light_bulb') {
            device.status = msg.status === 'ON' ? 'active' : 'off';
          } else if (device.deviceType === 'energy_tracker') {
            device.status = 'active'; // Or define logic based on data
          }
          await device.save();
          console.log(`Data and status updated for device ${deviceId}.`);
        } else {
          console.warn(`Received data from unregistered device ${deviceId}. Ignoring message.`);
        }
      } catch (error) {
        console.error('Failed to update device data:', error);
      }
    }
  });
}

// Call the setup function before exporting the client
setupMqttClient();

module.exports = mqttClient;
