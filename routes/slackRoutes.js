const express = require('express');
const router = express.Router();
const { sendSlackNotification } = require('../controllers/slackController');
router.post('/notify', sendSlackNotification);

module.exports = router; 