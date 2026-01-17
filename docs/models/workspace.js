const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    owner: { type: String, required: true }, // 생성자 ID
    members: [{
        userId: { type: String, required: true },
        status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
        invitedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Workspace', workspaceSchema);
