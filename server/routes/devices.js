const express = require('express');
const router = express.Router();
const Device = require('../models/device');
const mqttClient = require('../utils/mqttClient');
const {
  totalDevicesRegistered,
  currentlyConnectedDevices,
} = require('../metrics'); 

// Allowed device types
const allowedDeviceTypes = [
  'light_bulb',
  'energy_tracker',
  'smart_switch',
  'door_bell',
  'security_camera',
];

// Register a new device (User-initiated)
router.post('/register', async (req, res) => {
  const { deviceId, deviceType } = req.body;

  if (!deviceId || !deviceType) {
    return res.status(400).json({ error: 'deviceId and deviceType are required.' });
  }

  // Validate deviceType
  if (!allowedDeviceTypes.includes(deviceType)) {
    return res.status(400).json({ error: 'Invalid deviceType.' });
  }

  try {
    let device = await Device.findOne({ deviceId });
    if (device) {
      return res.status(400).json({ error: 'Device already exists.' });
    }

    device = new Device({ deviceId, deviceType });
    await device.save();

    // Increment the total devices registered counter
    totalDevicesRegistered.inc();

    // increment currently connected devices
    currentlyConnectedDevices.inc();

    // Publish registration event to MQTT
    mqttClient.publish(
      'devices/register',
      JSON.stringify({ deviceId, deviceType }),
      { retain: true },
      (err) => {
        if (err) {
          console.error('Failed to publish device registration event:', err);
        } else {
          console.log(`Published device registration event for ${deviceId}`);
        }
      }
    );

    res.status(201).json({ message: 'Device registered successfully.' });
  } catch (error) {
    console.error('Device registration failed:', error);
    res.status(500).json({ error: 'Failed to register device.' });
  }
});

// Retrieve device data
router.get('/:deviceId/data', async (req, res) => {
  const { deviceId } = req.params;

  try {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }

    res.status(200).json({ data: device.data });
  } catch (error) {
    console.error('Failed to retrieve device data:', error.message);
    res.status(500).json({ error: 'Failed to retrieve device data.' });
  }
});

// Retrieve device status
router.get('/:deviceId/status', async (req, res) => {
  const { deviceId } = req.params;

  try {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }

    res.status(200).json({ status: device.status });
  } catch (error) {
    console.error('Failed to retrieve device status:', error.message);
    res.status(500).json({ error: 'Failed to retrieve device status.' });
  }
});

// Send a command to a device
router.post('/:deviceId/commands', async (req, res) => {
  const { deviceId } = req.params;
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command is required.' });
  }

  // Check if the device exists
  try {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    // Publish the command to MQTT
    mqttClient.publish(
      `devices/${deviceId}/commands`,
      JSON.stringify({ command }),
      async (err) => {
        if (err) {
          console.error(`Failed to send command to ${deviceId}:`, err);
          return res.status(500).json({ error: 'Failed to send command.' });
        } else {
          console.log(`Command '${command}' sent to device ${deviceId}`);

          // Update device status based on command
          let newStatus;
          if (command === 'turn_off') {
            newStatus = 'off';
          } else if (command === 'turn_on') {
            newStatus = 'active';
          } else {
            // For other commands, do not update status
            return res.status(200).json({ message: `Command '${command}' sent to device ${deviceId}.` });
          }

          try {
            await Device.updateOne({ deviceId }, { status: newStatus });
            console.log(`Device ${deviceId} status updated to '${newStatus}'.`);
            return res.status(200).json({ message: `Command '${command}' sent to device ${deviceId}. Status updated to '${newStatus}'.` });
          } catch (updateErr) {
            console.error(`Failed to update status for device ${deviceId}:`, updateErr);
            return res.status(500).json({ error: 'Failed to update device status.' });
          }
        }
      }
    );

  } catch (err) {
    console.error('Failed to check device existence:', err);
    return res.status(500).json({ error: 'Failed to send command.' });
  }
});

module.exports = router;
