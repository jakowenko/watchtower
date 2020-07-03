const moment = require('moment-timezone');
const pluralize = require('pluralize');
const app = require('./app');

module.exports.splitImageTag = (img) => {
  const image = (img.includes('/') ? '' : 'library/') + img.split(':')[0];
  const tag = (img.split(':')[1] === undefined) ? 'latest' : img.split(':')[1];
  return { image, tag };
};

module.exports.msToTime = (duration) => {
  const digits = 2;
  const seconds = (Math.round(parseFloat(((duration / 1000) * (10 ** digits)).toFixed(11))) / (10 ** digits)).toFixed(digits);
  return `${seconds} ${pluralize('second', seconds)}`;
};

module.exports.time = () => {
  const { options } = app.config();
  return (options.TZ.toLowerCase() === 'utc') ? moment().utc().format(`${options.TIME_FORMAT} UTC`) : moment().tz(options.TZ).format(`${options.TIME_FORMAT} z`);
};
module.exports.formateBtyes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};
