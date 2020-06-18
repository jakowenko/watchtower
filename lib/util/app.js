const fs = require('fs');
const { version } = require('../../package.json');
require('dotenv').config();

module.exports.init = (opts = {}) => {
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
  }

  const { env } = process;

  const system = {
    FIRST_RUN: true,
    VERSION: version,
  };

  const options = {
    TZ: (env.TZ === undefined) ? 'UTC' : env.TZ,
    TIMER: (env.TIMER === undefined) ? 30 : parseFloat(env.TIMER),
    WATCH_ALL: env.WATCH_ALL !== 'false',
    EXTRA_IMAGES: process.env.EXTRA_IMAGES,
    NOTIFY_TYPE: env.NOTIFY_TYPE,
    NOTIFY_HTTP_URL: env.NOTIFY_HTTP_URL,
    NOTIFY_SUBJECT: (env.NOTIFY_SUBJECT === undefined) ? 'Watchtower' : env.NOTIFY_SUBJECT,
    NOTIFY_EMAIL_HOST: env.NOTIFY_EMAIL_HOST,
    NOTIFY_EMAIL_PORT: (env.NOTIFY_EMAIL_PORT === undefined) ? 587 : parseFloat(env.NOTIFY_EMAIL_PORT),
    NOTIFY_EMAIL_USERNAME: env.NOTIFY_EMAIL_USERNAME,
    NOTIFY_EMAIL_PASSWORD: env.NOTIFY_EMAIL_PASSWORD,
    NOTIFY_EMAIL_FROM_NAME: (env.NOTIFY_EMAIL_FROM_NAME === undefined) ? 'Notify' : env.NOTIFY_EMAIL_FROM_NAME,
    NOTIFY_EMAIL_TO: env.NOTIFY_EMAIL_TO,
    TIME_FORMAT: (env.TIME_FORMAT === undefined) ? 'MM/DD/YYYY hh:mm:ss' : env.TIME_FORMAT,
    DB_MEMORY: env.DB_MEMORY !== 'false',
    AUTO_UPDATE: env.AUTO_UPDATE === 'true',
    UPDATE_ON_START: env.UPDATE_ON_START === 'true',
    PRUNE_IMAGES: env.PRUNE_IMAGES === 'true',
    PRUNE_VOLUMES: env.PRUNE_VOLUMES === 'true',
    TELEMETRY: env.TELEMETRY !== 'false',
    LOGS: env.LOGS,
    ENV: (env.ENV === 'local') ? 'local' : 'prod',
  };

  for (const key in opts) {
    if ({}.hasOwnProperty.call(opts, key) && options.hasOwnProperty.call(options, key)) {
      options[key] = opts[key];
    }
  }

  for (const key in options) {
    if ({}.hasOwnProperty.call(options, key) && options[key] === undefined) {
      delete options[key];
    }
  }

  this.save(system, options);
  return { system, options };
};

module.exports.config = () => JSON.parse(fs.readFileSync('data/app.json'));

module.exports.save = (system, options) => fs.writeFileSync('data/app.json', JSON.stringify({ system, options }));

module.exports.update = (values = {}) => {
  const config = this.config();

  if (values.system !== undefined) {
    const { system } = values;
    for (const key in system) {
      if ({}.hasOwnProperty.call(system, key)) {
        config.system[key] = system[key];
      }
    }
  }

  if (values.options !== undefined) {
    const { options } = values;
    for (const key in options) {
      if ({}.hasOwnProperty.call(options, key)) {
        config.options[key] = options[key];
      }
    }
  }

  this.save(config.system, config.options);
};
