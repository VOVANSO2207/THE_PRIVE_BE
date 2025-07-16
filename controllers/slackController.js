const axios = require('axios');
require('dotenv').config();
const SLACK_WEBHOOK_URL = process.env.SLACK_URL;

exports.sendSlackNotification = async (req, res) => {
  const { creatorName, roomUrl } = req.body;
  if (!creatorName || !roomUrl) {
    return res.status(400).json({ message: 'Thiếu thông tin creatorName hoặc roomUrl' });
  }
  const text = `:telephone_receiver: *${creatorName}* vừa tạo cuộc gọi video!\nLink phòng: ${roomUrl}`;
  try {
    await axios.post(SLACK_WEBHOOK_URL, { text });
    res.json({ message: 'Đã gửi thông báo Slack!' });
  } catch (err) {
    res.status(500).json({ message: 'Gửi Slack thất bại', error: err.message });
  }
}; 