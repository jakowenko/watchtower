module.exports.app = require('./config').app();
const axios = require('axios');
const Docker = require('dockerode');
const moment = require('moment-timezone');
const pluralize = require('pluralize');
const db = require('./db');
const notify = require('./notify');
const config = require('./config')();
const logger = require('./logger');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const { app } = this;

module.exports.run = async () => {
  if (app.SYSTEM_FIRST_RUN && (config.ENV === 'local' || config.LOGS === 'verbose')) {
    console.log(config);
  }

  const time = (config.TZ.toLowerCase() === 'utc') ? moment().utc().format('MM/DD/YYYY HH:mm:ss UTC') : moment().tz(config.TZ).format('MM/DD/YYYY HH:mm:ss z');
  const containers = await docker.listContainers();
  for (let i = containers.length - 1; i >= 0; i -= 1) {
    if (containers[i].Image.includes('sha256:')) {
      containers.splice(i, 1);
    }
  }

  app.STATUS = `watching ${containers.length} ${pluralize('container', containers.length)} @ ${time}`;
  logger.log(logger.dashes());
  logger.log(app.STATUS);
  logger.log(logger.dashes());

  db.init();
  db.insert(containers);

  const activeImages = db.select();
  if (activeImages.length) {
    const updates = await this.checkDockerHub(activeImages);
    db.update(updates);
    await this.check();
    if (config.AUTO_UPDATE) {
      await this.download();
      await this.restart();
    }
    db.clearUpdatedImages();
  }
  if (app.SYSTEM_FIRST_RUN) {
    app.SYSTEM_FIRST_RUN = false;
  }

  if (config.TIMER > 0) {
    setTimeout(async () => {
      await this.run();
    }, config.TIMER * 60 * 1000);
  }
};

module.exports.check = async () => {
  const message = { log: null, notify: null };
  const images = db.updatedImages();
  if (!images.length) {
    message.log = 'no new updates found';
    message.notify = message.log;
  } else {
    const formatted = images.map((image) => `${image.image}:${image.tag} | ${moment(image.dockerHubLastUpdated).fromNow()}`);
    message.notify = `${images.length} ${pluralize('update', images.length)} found:\n* ${formatted.join('\n* ')}`;
    message.log = `${images.length} ${pluralize('update', images.length)} found:\n${logger.dashes()}\n`;
    message.log += `* ${formatted.join('\n* ')}`;
  }
  logger.log(message.log);

  if (images.length || app.SYSTEM_FIRST_RUN) {
    switch (config.NOTIFY_TYPE) {
      case 'http':
        await notify.post(config, message.notify);
        break;
      case 'email':
        await notify.email(config, message.notify);
        break;
      default:
        break;
    }
  }

  return images;
};

module.exports.checkDockerHub = async (images) => {
  const checkedImages = [...images];

  for (let i = 0; i < checkedImages.length; i += 1) {
    const image = checkedImages[i];
    try {
      const response = await axios({
        method: 'get',
        url: `https://hub.docker.com/v2/repositories/${image.image}/tags/${image.tag}`,
      });
      const dockerHub = response.data;
      if (dockerHub.name === image.tag) {
        image.isUpdated = ((moment(image.dockerHubLastUpdated) < moment(dockerHub.last_updated)) || (app.SYSTEM_FIRST_RUN && moment(image.createdAt) < moment(dockerHub.last_updated)));
        image.dockerHubNewTime = dockerHub.last_updated;
      }
    } catch (error) {
      logger.log(`${image.image}:${image.tag} - error pulling tag`);
      continue;
    }
  }

  return images;
};

module.exports.restart = async () => {
  const message = 'recreating containers';
  const images = db.updatedImages();
  if (!images.length) {
    return;
  }

  logger.log('-'.repeat(app.STATUS.length));
  logger.log(message);
  logger.log('-'.repeat(app.STATUS.length));

  for (let i = 0; i < images.length; i += 1) {
    const container = docker.getContainer(images[i].containerId);
    const data = await container.inspect();
    const createOptions = {
      name: images[i].containerName, ...data.Config, HostConfig: data.HostConfig, NetworkingConfig: data.NetworkingConfig,
    };

    console.log(`${createOptions.name}`);
    await container.stop(container.Id);
    // console.log(`stopped ${createOptions.name}`);
    await container.remove();
    // console.log(`removed ${createOptions.name}`);
    const createdContainer = await docker.createContainer(createOptions);
    // console.log(`created ${createOptions.name}`);
    await createdContainer.start();
    // console.log(`started ${createOptions.name}`);
  }
  logger.log('recreations complete');
};

module.exports.download = async () => {
  const message = 'downloading images';
  const images = db.updatedImages();
  if (!images.length) {
    return;
  }

  logger.log('-'.repeat(app.STATUS.length));
  logger.log(message);
  logger.log('-'.repeat(app.STATUS.length));

  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    console.log(`${image.image}:${image.tag}`);
    await docker.createImage({ fromImage: image.image, tag: image.tag });
  }

  logger.log('downloads complete');
};
