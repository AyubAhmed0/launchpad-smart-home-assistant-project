const mqtt = require('mqtt');
const winston = require('winston');

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883';
const DEVICE_ID = 'energy_tracker_1';
const DEVICE_TYPE = 'energy_tracker';

const HIGH_ENERGY_THRESHOLD = 80;
let previousEnergyUsage = 0;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});

// MQTT Client
let client = mqtt.connect(MQTT_BROKER_URL);

function setupClient() {
  client.on('connect', () => {
    logger.info('Connected to MQTT broker');

    // Publish device registration event with retain flag
    client.publish(
      'devices/register',
      JSON.stringify({
        deviceId: DEVICE_ID,
        deviceType: DEVICE_TYPE,
      }),
      { retain: true },
      (err) => {
        if (err) {
          logger.error('Failed to publish device registration event:', err.message);
        } else {
          logger.info('Published device registration event with retain flag');
        }
      }
    );

    // Start monitoring energy usage
    setInterval(monitorEnergyUsage, 10000); // Check every 10 seconds
  });

  client.on('error', (error) => {
    logger.error('MQTT client error:', error.message || error);
  });

  client.on('message', (topic, message) => {
    if (topic === `devices/${DEVICE_ID}/commands`) {
      const command = JSON.parse(message.toString());
      logger.info(`Received command: ${JSON.stringify(command)}`);

      if (command.command === 'disconnect') {
        // Disconnect the device
        client.end();
        logger.info('Energy tracker disconnected from the system');
      } else if (command.command === 'connect') {
        // Reconnect the device
        if (client.disconnected) {
          client = mqtt.connect(MQTT_BROKER_URL);
          setupClient();
          logger.info('Energy tracker reconnected to the system');
        } else {
          logger.info('Energy tracker is already connected');
        }
      }
    }
  });

  // Subscribe to commands for this device
  client.subscribe(`devices/${DEVICE_ID}/commands`, (err) => {
    if (err) {
      logger.error('Failed to subscribe to commands topic:', err.message);
    } else {
      logger.info(`Subscribed to topic devices/${DEVICE_ID}/commands`);
    }
  });
}

setupClient();

function monitorEnergyUsage() {
  // Simulate energy usage data
  const energyUsage = Math.random() * 100;

  // Publish energy usage data
  client.publish(`devices/${DEVICE_ID}/data`, JSON.stringify({ energyUsage }), (err) => {
    if (err) {
      logger.error('Failed to send energy usage data:', err.message);
    } else {
      logger.info(`Energy usage data sent: ${energyUsage.toFixed(2)}`);
    }
  });

  // Check if energy usage crosses the threshold from below to above
  if (previousEnergyUsage <= HIGH_ENERGY_THRESHOLD && energyUsage > HIGH_ENERGY_THRESHOLD) {
    const event = {
      deviceId: DEVICE_ID,
      eventType: 'high_energy_usage',
      value: energyUsage,
    };

    client.publish('events/high_energy_usage', JSON.stringify(event), (err) => {
      if (err) {
        logger.error('Failed to publish high energy usage event:', err.message);
      } else {
        logger.info('Published high energy usage event');
      }
    });
  }

  previousEnergyUsage = energyUsage;
}
