const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    contents: { type: String, default: '' },
    editors: { type: Array, required: true }
});

module.exports = mongoose.model('Notes', noteSchema);