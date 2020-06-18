const chalk = require('chalk');
const app = require('./app');

const { log } = console;

module.exports.log = (message, config = {}) => {
  if (config.bold) {
    log(chalk.bold[config.color](message));
  } else {
    log(message);
  }
};

module.exports.dashes = () => {
  const { system } = app.config();
  return '-'.repeat(system.STATUS.length);
};
