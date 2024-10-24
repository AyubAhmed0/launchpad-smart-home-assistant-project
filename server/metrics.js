const promClient = require('prom-client');

// Initialise default metrics collection
promClient.collectDefaultMetrics({ timeout: 5000 });

// Define custom metrics
const totalDevicesRegistered = new promClient.Counter({
  name: 'smart_home_total_devices_registered',
  help: 'Total number of devices registered',
});

const currentlyConnectedDevices = new promClient.Gauge({
  name: 'smart_home_currently_connected_devices',
  help: 'Number of currently connected devices',
});

const totalEventsPublished = new promClient.Counter({
  name: 'smart_home_total_events_published',
  help: 'Total number of events published',
});

// Middleware to measure HTTP request durations
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
});

// Export the metrics for use in other modules
module.exports = {
  totalDevicesRegistered,
  currentlyConnectedDevices,
  totalEventsPublished,
  httpRequestDurationMicroseconds,
  promClient, // Exporting promClient for metrics endpoint
};
