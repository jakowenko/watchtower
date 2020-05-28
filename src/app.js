const dotenv = require('dotenv');
const watchtower = require('./util/watchtower');

dotenv.config();

const timer = (process.env.TIMER === undefined) ? 30 : parseFloat(process.env.TIMER);

watchtower.run();
setInterval(() => {
  watchtower.run();
}, timer * 60 * 1000);
