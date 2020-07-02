const Docker = require('dockerode');
const app = require('./app');
const notify = require('./notify');
const logger = require('./logger');
const db = require('./db');
const parse = require('./parse');
const to = require('./to');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

module.exports.check = () => {
  if (process.argv.join().includes('--update-helper')) {
    return true;
  }
  return false;
};

module.exports.queue = async (attempt = 1) => {
  if (attempt === 1) logger.log('auto update started');

  const containers = await docker.listContainers({ all: true });

  const container = parse.containers({ image: 'jakowenko/watchtower', name: 'watchtower-helper', operator: '!=' }, containers);

  if (!container) {
    logger.log('no watchtower container found');
    return;
  }

  if (container.State !== 'exited') {
    if (attempt > 10) {
      logger.log('container did not stop itself, update aborted');
      return;
    }
    logger.log('waiting for container to stop before continuing');
    setTimeout(async () => { await this.queue(attempt + 1); }, 5000);
    return;
  }

  await this.start(container.Id);
};

module.exports.start = async (containerId) => {
  const container = docker.getContainer(containerId);
  const data = await container.inspect();
  const name = data.Name.replace('/', '');

  const stream = await docker.pull(data.Config.Image);
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
  });
  logger.log('download complete');

  const createOptions = {
    name, ...data.Config, HostConfig: data.HostConfig, NetworkingConfig: data.NetworkingConfig,
  };
  const [error] = await to(container.remove({ force: true }));
  if (error) {
    logger.log(error.json.message);
  }
  const createdContainer = await docker.createContainer(createOptions);
  await createdContainer.start();
  logger.log('update complete');
};

module.exports.createContainer = async () => {
  const { WATCHTOWER_UPDATE_PENDING } = app.config().system;
  const [watchtowerImage] = db.watchtowerImage();
  if (WATCHTOWER_UPDATE_PENDING && watchtowerImage) {
    const message = 'updating watchtower...be right back';
    logger.log(logger.dashes());
    logger.log(message);
    notify.send(message);


    const container = docker.getContainer(watchtowerImage.containerId);
    const data = await container.inspect();

    const createOptions = {
      name: 'watchtower-helper', Image: `${watchtowerImage.image}:${watchtowerImage.tag}`, Cmd: ['node', 'index.js', '--update-helper'], HostConfig: { Binds: data.HostConfig.Binds },
    };
    const createdContainer = await docker.createContainer(createOptions);
    await createdContainer.start();
    app.update({ system: { WATCHTOWER_UPDATE_PENDING: false }, options: { TIMER: 0 } });
    logger.log('helper container started');
  }
};

module.exports.removeContainer = async () => {
  const containers = await docker.listContainers({ all: true });
  const container = parse.containers({ image: 'jakowenko/watchtower', name: 'watchtower-helper', operator: '=' }, containers);
  if (container) {
    const helperContainer = docker.getContainer(container.Id);
    const [error] = await to(helperContainer.remove({ force: true }));
    if (!error) {
      logger.log('watchtower helper removed');
      logger.log(logger.dashes());
    }
  }
};
