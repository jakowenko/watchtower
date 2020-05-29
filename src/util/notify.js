const axios = require('axios');
const nodemailer = require('nodemailer');

module.exports.post = async (config, message) => {
  await axios({
    method: 'post',
    url: config.NOTIFY_HTTP_URL,
    data: {
      title: config.NOTIFY_SUBJECT,
      text: (!config.isStarted) ? `${config.status}\n${message}` : message,
    },
  });
};

module.exports.email = async (config, message) => {
  const transporter = nodemailer.createTransport({
    host: config.NOTIFY_EMAIL_HOST,
    port: config.NOTIFY_EMAIL_PORT,
    secure: (config.NOTIFY_EMAIL_PORT === 465),
    auth: {
      user: config.NOTIFY_EMAIL_USERNAME,
      pass: config.NOTIFY_EMAIL_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: `"${config.NOTIFY_EMAIL_FROM_NAME}" <${config.NOTIFY_EMAIL_USERNAME}>`,
    to: config.NOTIFY_EMAIL_TO,
    subject: config.NOTIFY_SUBJECT,
    text: (!config.isStarted) ? `${config.status}\n${message}` : message,
  });
};

module.exports.log = (message) => {
  console.log(message);
};
