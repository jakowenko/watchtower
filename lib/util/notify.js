const axios = require('axios');
const nodemailer = require('nodemailer');
const app = require('./app');

module.exports.post = async (message) => {
  const { system, options } = app.config();

  await axios({
    method: 'post',
    url: options.NOTIFY_HTTP_URL,
    data: {
      title: options.NOTIFY_SUBJECT,
      text: (system.FIRST_RUN) ? `${system.STATUS}\n${message}` : message,
    },
  });
};

module.exports.email = async (message) => {
  const { system, options } = app.config();

  const transporter = nodemailer.createTransport({
    host: options.NOTIFY_EMAIL_HOST,
    port: options.NOTIFY_EMAIL_PORT,
    secure: (options.NOTIFY_EMAIL_PORT === 465),
    auth: {
      user: options.NOTIFY_EMAIL_USERNAME,
      pass: options.NOTIFY_EMAIL_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: `"${options.NOTIFY_EMAIL_FROM_NAME}" <${options.NOTIFY_EMAIL_USERNAME}>`,
    to: options.NOTIFY_EMAIL_TO,
    subject: options.NOTIFY_SUBJECT,
    text: (system.FIRST_RUN) ? `${system.STATUS}\n${message}` : message,
  });
};
