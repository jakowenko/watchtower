const chalk = require('chalk');
const { app } = require('./watchtower');

const { log } = console;

module.exports.log = (message, config = {}) => {
  if (config.bold) {
    log(chalk.bold(message));
  } else {
    log(message);
  }
};

module.exports.dashes = () => '-'.repeat(app.STATUS.length);
