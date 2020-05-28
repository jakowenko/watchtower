const axios = require('axios');
const { Docker } = require('node-docker-api');
const moment = require('moment-timezone');
const db = require('./db');
const notify = require('./notify');

const config = {};

module.exports.run = async () => {
  config.tz = process.env.TZ;
  config.type = process.env.NOTIFY_TYPE;
  config.httpUrl = process.env.NOTIFY_HTTP_URL;
  config.subject = (process.env.NOTIFY_SUBJECT === undefined) ? 'Watch' : process.env.NOTIFY_SUBJECT;

  const time = (config.tz === undefined || config.tz === '' || config.tz.toLowerCase() === 'utc') ? moment().utc().format('MM/DD/YYYY HH:mm:ss UTC') : moment().tz(config.tz).format('MM/DD/YYYY HH:mm:ss z');
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const containers = await docker.container.list();

  db.init();
  const watching = db.insert(containers);
  const message = `watching ${watching.length} ${(watching.length === 1) ? 'container' : 'containers'} @ ${time}`;
  notify.log(message);

  if (!config.isStarted && config.type === 'http') {
    await notify.post(config, message);
  }

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
  if (!images.length) {
    notify.log('no updates found');
    return;
  }

  const updates = images.map((image) => image.image);
  const message = `${updates.length} ${(updates.length === 1) ? 'update' : 'updates'} found:\n- ${updates.join('\n- ')}`;
  notify.log(message);
  if (config.type === 'http') {
    await notify.post(config, message);
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
