module.exports.app = require('./config').app();
const axios = require('axios');
const perf = require('execution-time')();
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
  perf.start('watchtower');
  this.telemetry();

  if (app.SYSTEM_FIRST_RUN && (config.ENV === 'local' || config.LOGS === 'verbose')) {
    logger.log(config);
  }

  const containers = db.insert(await docker.listContainers());
  app.STATUS = `watching ${containers.length} ${pluralize('container', containers.length)} @ ${this.time()}`;

  if (app.SYSTEM_FIRST_RUN) {
    logger.log(logger.dashes());
    logger.log(`v${app.VERSION}`);
    logger.log(logger.dashes());
  } else {
    logger.log(logger.dashes());
  }
  logger.log(app.STATUS, { bold: true, color: 'green' });
  logger.log(logger.dashes());

  const activeImages = db.select();
  if (activeImages.length) {
    const updates = await this.checkDockerHub(activeImages);
    db.update(updates);
    await this.check();
    if (config.AUTO_UPDATE) {
      await this.download();
      await this.restart();
    }
    await this.prune();

    db.clearUpdatedImages();
  }

  if (app.SYSTEM_FIRST_RUN) {
    app.SYSTEM_FIRST_RUN = false;
  }

  const timer = perf.stop('watchtower');
  logger.log(logger.dashes());
  logger.log(`run complete in ${this.msToTime(timer.time)}`, { bold: true, color: 'green' });

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
    message.log = 'no updates found';
    message.notify = message.log;
  } else {
    const formatted = images.map((image) => `${image.image}:${image.tag} | ${moment(image.dockerHubLastUpdated).fromNow()}`);
    message.notify = `${images.length} ${pluralize('update', images.length)} found\n${formatted.join('\n')}`;
    message.log = `${images.length} ${pluralize('update', images.length)} found\n`;
    message.log += `${formatted.join('\n')}`;
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
  const images = db.updatedImages('restart');
  const verb = {
    start: pluralize('container', images.length),
    end: pluralize('recreation', images.length),
  };
  const message = `recreating ${images.length} ${verb.start}`;
  if (!images.length) {
    return;
  }

  logger.log(logger.dashes());
  logger.log(message);

  perf.start();
  for (let i = 0; i < images.length; i += 1) {
    if (images[i].image === 'jakowenko/watchtower') {
      logger.log('watchtower needs to be recreated manually');
      continue;
    }
    const container = docker.getContainer(images[i].containerId);
    const data = await container.inspect();
    const createOptions = {
      name: images[i].containerName, ...data.Config, HostConfig: data.HostConfig, NetworkingConfig: data.NetworkingConfig,
    };
    logger.log(`${createOptions.name}`);
    await container.stop(container.Id);
    await container.remove();
    const createdContainer = await docker.createContainer(createOptions);
    await createdContainer.start();
  }
  const timer = perf.stop();

  logger.log(`${verb.end} complete in ${this.msToTime(timer.time)}`);
  if (!config.PRUNE_VOLUMES && config.PRUNE_IMAGES) {
  }
};

module.exports.download = async () => {
  const images = db.updatedImages('download');
  const verb = {
    start: pluralize('images', images.length),
    end: pluralize('download', images.length),
  };
  const message = `downloading ${images.length} ${verb.start}`;
  if (!images.length) {
    return;
  }

  logger.log(logger.dashes());
  logger.log(message);

  perf.start();
  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    logger.log(`${image.image}:${image.tag}`);
    const stream = await docker.pull(`${image.image}:${image.tag}`);
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });
  }
  const timer = perf.stop();

  logger.log(`${verb.end} complete in ${this.msToTime(timer.time)}`);
};

module.exports.msToTime = (duration) => {
  const digits = 2;
  const seconds = (Math.round(parseFloat(((duration / 1000) * (10 ** digits)).toFixed(11))) / (10 ** digits)).toFixed(digits);
  return `${seconds} ${pluralize('second', seconds)}`;
};

module.exports.time = () => ((config.TZ.toLowerCase() === 'utc') ? moment().utc().format(`${config.TIME_FORMAT} UTC`) : moment().tz(config.TZ).format(`${config.TIME_FORMAT} z`));

module.exports.formateBtyes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

module.exports.prune = async () => {
  const images = db.updatedImages('download');
  if (!images.length) {
    return;
  }

  if (config.PRUNE_VOLUMES || config.PRUNE_IMAGES) {
    logger.log(logger.dashes());
    perf.start();
    if (config.PRUNE_IMAGES) {
      const pruned = await docker.pruneImages({ filters: { dangling: { false: true } } });
      const spaceReclaimed = pruned.SpaceReclaimed;
      pruned.ImagesDeleted = (pruned.ImagesDeleted === null) ? [] : pruned.ImagesDeleted;
      logger.log(`${pruned.ImagesDeleted.length} ${pluralize('image', pruned.ImagesDeleted.length)} pruned ${(spaceReclaimed > 0) ? `| ${this.formateBtyes(spaceReclaimed)}` : ''}`);
    }

    if (config.PRUNE_VOLUMES) {
      const pruned = await docker.pruneVolumes();
      const spaceReclaimed = pruned.SpaceReclaimed;
      logger.log(`${pruned.VolumesDeleted.length} ${pluralize('volume', pruned.VolumesDeleted.length)} pruned ${(spaceReclaimed > 0) ? `| ${this.formateBtyes(spaceReclaimed)}` : ''}`);
    }

    const timer = perf.stop();

    logger.log(`pruning complete in ${this.msToTime(timer.time)}`);
  }
};

module.exports.telemetry = () => {
  if (config.TELEMETRY) {
    axios({
      method: 'post',
      url: 'https://watchtower-api.jako.io/telemetry',
      data: {
        version: app.VERSION,
      },
    }).catch(() => {});
  }
};
