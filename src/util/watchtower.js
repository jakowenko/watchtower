const axios = require('axios');
const Docker = require('dockerode');
const moment = require('moment-timezone');
const db = require('./db');
const notify = require('./notify');
const config = require('./config')();

process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
  const request = process.stdin.read().replace(/\W/g, '');
  if (request === 'watching') {
    const activeImages = db.select();
    console.log(activeImages);
  }
});

module.exports.run = async () => {
  const time = (config.TZ.toLowerCase() === 'utc') ? moment().utc().format('MM/DD/YYYY HH:mm:ss UTC') : moment().tz(config.TZ).format('MM/DD/YYYY HH:mm:ss z');
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const containers = await docker.listContainers();

  db.init();
  const watching = db.insert(containers);
  config.status = `${(config.isStarted) ? '\n' : ''}watching ${watching.length} ${(watching.length === 1) ? 'container' : 'containers'} @ ${time}`;
  notify.log(config.status);

  const activeImages = db.select();
  if (activeImages.length) {
    db.update(await this.checkDockerHub(activeImages));
    await this.check();
  }
  if (!config.isStarted) {
    config.isStarted = true;
  }
};

module.exports.check = async () => {
  const images = db.updatedImages();
  const updates = images.map((image, i) => `${image.image} | ${moment(image.dockerHubLastUpdated).fromNow()}${(i > 0) ? '\n' : ''}`);
  const message = (!images.length) ? 'no updates found' : `${updates.length} ${(updates.length === 1) ? 'update' : 'updates'} found:\n- ${updates.join('\n- ')}`;
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
