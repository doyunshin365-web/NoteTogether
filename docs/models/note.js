const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    contents: { type: String, default: '' },
    editors: { type: [String], required: true },
    workspaceId: { type: String, default: null }
});

module.exports = mongoose.model('Notes', noteSchema);