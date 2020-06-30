const axios = require('axios');
const nodemailer = require('nodemailer');
const app = require('./app');

module.exports.send = async (message) => {
  const { options } = app.config();

  switch (options.NOTIFY_TYPE) {
    case 'http':
      await this.post(message);
      break;
    case 'email':
      await this.email(message);
      break;
    default:
      break;
  }
};

module.exports.post = async (message) => {
  const { options } = app.config();

  await axios({
    method: 'post',
    url: options.NOTIFY_HTTP_URL,
    data: {
      title: options.NOTIFY_SUBJECT,
      text: message,
    },
  });
};

module.exports.email = async (message) => {
  const { options } = app.config();

  const transporterOptions = {
    host: options.NOTIFY_EMAIL_HOST,
    port: options.NOTIFY_EMAIL_PORT,
    secure: (options.NOTIFY_EMAIL_PORT === 465),
    ignoreTLS: options.NOTIFY_EMAIL_IGNORE_TLS,
    auth: {
      user: options.NOTIFY_EMAIL_USERNAME,
      pass: options.NOTIFY_EMAIL_PASSWORD,
    },
  };
  const transporter = nodemailer.createTransport(transporterOptions);

  await transporter.sendMail({
    from: `"${options.NOTIFY_EMAIL_FROM_NAME}" <${options.NOTIFY_EMAIL_USERNAME}>`,
    to: options.NOTIFY_EMAIL_TO,
    subject: options.NOTIFY_SUBJECT,
    text: message,
  });
};
