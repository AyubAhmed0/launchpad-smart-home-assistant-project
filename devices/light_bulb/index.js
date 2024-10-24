const mqtt = require('mqtt');

const DEVICE_ID = 'light_bulb_1';
const DEVICE_TYPE = 'light_bulb';
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883';

let client;
let dataInterval;
let lightStatus = 'ON';
let isDisconnected = false; // Flag to simulate device disconnection

function setupClient() {
  client = mqtt.connect(MQTT_BROKER_URL);

  client.on('connect', () => {
    console.log('Connected to MQTT broker');

    // Publish device registration event with retain flag
    const registrationMessage = {
      deviceId: DEVICE_ID,
      deviceType: DEVICE_TYPE,
    };

    client.publish('devices/register', JSON.stringify(registrationMessage), { retain: true }, (err) => {
      if (err) {
        console.error('Failed to publish device registration event:', err.message);
      } else {
        console.log('Published device registration event with retain flag');
      }
    });

    // Subscribe to commands for this device
    client.subscribe(`devices/${DEVICE_ID}/commands`, { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to subscribe to command topic:', err.message);
      } else {
        console.log(`Subscribed to topic devices/${DEVICE_ID}/commands`);
      }
    });
  });

  client.on('error', (error) => {
    console.error('MQTT client error:', error.message);
  });

  client.on('message', (topic, message) => {
    if (topic === `devices/${DEVICE_ID}/commands`) {
      const command = JSON.parse(message.toString());
      console.log('Received command:', command);

      if (command.command === 'disconnect') {
        if (isDisconnected) {
          console.log('Light bulb is already disconnected');
        } else {
          isDisconnected = true;
          console.log('Light bulb disconnected from the system');
          clearInterval(dataInterval); // Stop sending data
        }
      } else if (command.command === 'connect') {
        if (!isDisconnected) {
          console.log('Light bulb is already connected');
        } else {
          isDisconnected = false;
          console.log('Light bulb reconnected to the system');
          dataInterval = setInterval(sendDeviceData, 10000); // Resume sending data
        }
      } else {
        if (isDisconnected) {
          console.log('Light bulb is disconnected; ignoring command');
          return;
        }

        if (command.command === 'turn_off') {
          if (lightStatus === 'OFF') {
            console.log('Light bulb is already OFF');
          } else {
            lightStatus = 'OFF';
            console.log('Turning off the light bulb');

            // Send updated device data
            sendDeviceData();

            // Set a timer to turn the light back on after 10 seconds
            setTimeout(() => {
              lightStatus = 'ON';
              console.log('Turning on the light bulb after 10 seconds');
              sendDeviceData();
            }, 10000); // 10000 milliseconds = 10 seconds
          }
        } else if (command.command === 'turn_on') {
          if (lightStatus === 'ON') {
            console.log('Light bulb is already ON');
          } else {
            lightStatus = 'ON';
            console.log('Turning on the light bulb');
            sendDeviceData();
          }
        } else {
          console.warn('Unknown command received:', command.command);
        }
      }
    }
  });
}

// Start the MQTT client
setupClient();

// Start sending device data
dataInterval = setInterval(sendDeviceData, 10000);

function sendDeviceData() {
  if (isDisconnected) {
    console.warn('Light bulb is disconnected; not sending data');
    return;
  }

  const data = {
    status: lightStatus,
  };

  if (client.connected) {
    client.publish(`devices/${DEVICE_ID}/data`, JSON.stringify(data), (err) => {
      if (err) {
        console.error('Failed to send device data:', err.message);
      } else {
        console.log('Device data sent');
      }
    });
  } else {
    console.warn('Cannot send device data: MQTT client not connected');
  }
}



