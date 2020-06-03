const axios = require('axios');
const Docker = require('dockerode');
const moment = require('moment-timezone');
const db = require('./db');
const notify = require('./notify');
const config = require('./config')();

module.exports.run = async () => {
  if (!config.isStarted && (config.ENV === 'local' || config.LOGS === 'verbose')) {
    console.log(config);
  }

  const time = (config.TZ.toLowerCase() === 'utc') ? moment().utc().format('MM/DD/YYYY HH:mm:ss UTC') : moment().tz(config.TZ).format('MM/DD/YYYY HH:mm:ss z');
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const containers = await docker.listContainers();

  db.init();
  const watching = db.insert(containers);
  config.status = `${(config.isStarted) ? '\n' : ''}watching ${watching.length} ${(watching.length === 1) ? 'container' : 'containers'} @ ${time}`;
  notify.log(config.status);
  notify.log('-'.repeat(config.status.length));

  const activeImages = db.select();
  if (activeImages.length) {
    db.update(await this.checkDockerHub(activeImages));
    await this.check();
  }
  if (!config.isStarted) {
    config.isStarted = true;
  }

  if (config.TIMER > 0) {
    setTimeout(async () => {
      this.run();
    }, config.TIMER * 60 * 1000);
  }
};

module.exports.check = async () => {
  const images = db.updatedImages();
  // const updates = images.map((image, i) => `${image.image} | ${moment(image.dockerHubLastUpdated).fromNow()}${(i > 0) ? '\n' : ''}`);
  const updates = images.map((image) => ({
    image: image.image,
    dockerHubLastUpdated: image.dockerHubLastUpdated,
  }));
  let message = '';
  if (!images.length) {
    message = `${message}no new updates found`;
  } else {
    const formatted = updates.map((image, i) => `${image.image} | ${moment(image.dockerHubLastUpdated).fromNow()}${(i > 0) ? '\n' : ''}`);
    message = `${message}${updates.length} ${(updates.length === 1) ? 'update' : 'updates'} found:\n  * ${formatted.join('\n  * ')}`;
  }
  // if (previousUpdates.length) {
  //   const formatted = previousUpdates.map((image, i) => `${image.image} | ${moment(image.dockerHubLastUpdated).fromNow()}${(i > 0) ? '\n' : ''}`);
  //   message = `${message}\n  ${formatted.join('\n  ')}`;
  // }
  notify.log(message);

  if (images.length || !config.isStarted) {
    switch (config.NOTIFY_TYPE) {
      case 'http':
        await notify.post(config, message);
        break;
      case 'email':
        await notify.email(config, message);
        break;
      default:
        break;
    }
  }

  // if (updates.length) {
  //   previousUpdates.push(...updates);
  // }
};

module.exports.checkDockerHub = async (images) => {
  const checkedImages = [...images];

  for (let i = 0; i < checkedImages.length; i += 1) {
    let image = checkedImages[i].image.split(':')[0];
    let tag = checkedImages[i].image.split(':')[1];
    if (tag === undefined) {
      tag = 'latest';
    }
    if (!image.includes('/')) {
      image = `library/${image}`;
    }

    try {
      const response = await axios({
        method: 'get',
        url: `https://hub.docker.com/v2/repositories/${image}/tags/${tag}`,
      });
      const dockerHub = response.data;
      if (dockerHub.name === tag) {
        checkedImages[i].isUpdated = ((moment(checkedImages[i].dockerHubLastUpdated) < moment(dockerHub.last_updated)) || (!config.isStarted && moment(checkedImages[i].createdAt) < moment(dockerHub.last_updated)));
        checkedImages[i].dockerHubNewTime = dockerHub.last_updated;
      }
    } catch (error) {
      notify.log(`${image}:${tag} - error pulling tag`);
      continue;
    }
  }

  return images;
};
