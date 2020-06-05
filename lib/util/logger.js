// const chalk = require('chalk');
const { app } = require('./watchtower');

const { log } = console;

module.exports.log = (message) => {
  log(message);
};

module.exports.dashes = () => '-'.repeat(app.STATUS.length);
