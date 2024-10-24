const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true, required: true },
  deviceType: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: ['off', 'active', 'triggered'], default: 'active' },
  commands: [{ type: mongoose.Schema.Types.Mixed }],
});

module.exports = mongoose.model('Device', deviceSchema);
