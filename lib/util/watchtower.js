const axios = require('axios');
const perf = require('execution-time')();
const Docker = require('dockerode');
const moment = require('moment-timezone');
const pluralize = require('pluralize');
const db = require('./db');
const notify = require('./notify');
const logger = require('./logger');
const app = require('./app');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

module.exports.run = async (opts = {}) => {
  if (process.argv.join().includes('--update-helper')) {
    logger.log('auto update triggered');
    setTimeout(async () => {
      await this.autoUpdate();
    }, 5000);
    return;
  }

  const { system, options } = (opts.cron) ? app.config() : app.init(opts);

  perf.start('watchtower');
  this.telemetry();

  if (system.FIRST_RUN && (options.ENV === 'local' || options.LOGS === 'verbose')) {
    logger.log(options);
  }

  const containers = db.insert(await docker.listContainers());
  system.STATUS = `watching ${containers.length} ${pluralize('container', containers.length)} @ ${this.time()}`;
  app.update({ system, options });

  if (system.FIRST_RUN) {
    logger.log(logger.dashes());
    logger.log(`v${system.VERSION}`);
    logger.log(logger.dashes());
    await this.removeUpdateHelper();
    this.prune(true);
  } else {
    logger.log(logger.dashes());
  }
  logger.log(system.STATUS, { bold: true, color: 'green' });

  const activeImages = db.select();
  if (activeImages.length) {
    const updates = await this.checkDockerHub(activeImages);
    db.update(updates);
    await this.checkDockerHubUpdates();
    if (options.AUTO_UPDATE) {
      await this.download();
      await this.restart();
    }
    const container = await this.createUpdateContainer();
    if (container) {
      // watchtower has an update, stop the timer
      options.TIMER = 0;
      await container.start();
      logger.log('helper container started');
    }
    await this.prune();
    db.clearUpdatedImages();
  }

  if (system.FIRST_RUN) {
    system.FIRST_RUN = false;
    app.update({ system });
  }

  const timer = perf.stop('watchtower');
  logger.log(logger.dashes());
  logger.log(`run complete in ${this.msToTime(timer.time)}`, { bold: true, color: 'green' });

  if (options.TIMER > 0) {
    setTimeout(async () => {
      await this.run({ cron: true });
    }, options.TIMER * 60 * 1000);
  }
};

module.exports.checkDockerHubUpdates = async () => {
  const { system } = app.config();
  const message = { log: null, notify: null };
  const images = db.updatedImages();
  if (!images.length) {
    message.log = 'no updates found';
    message.notify = (system.FIRST_RUN) ? `${system.STATUS}\n${message.log}` : message.log;
  } else {
    const formatted = images.map((image) => `${image.image}:${image.tag} | ${moment(image.dockerHubLastUpdated).fromNow()}`);
    message.notify = `${images.length} ${pluralize('update', images.length)} found\n${formatted.join('\n')}`;
    message.notify = (system.FIRST_RUN) ? `${system.STATUS}\n${message.notify}` : message.notify;
    message.log = `${images.length} ${pluralize('update', images.length)} found\n`;
    message.log += `${formatted.join('\n')}`;
  }
  logger.log(logger.dashes());
  logger.log(message.log);

  if (images.length || system.FIRST_RUN) {
    notify.send(message.notify);
  }

  return images;
};

module.exports.checkDockerHub = async (images) => {
  const { system } = app.config();
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
        image.isUpdated = ((moment(image.dockerHubLastUpdated) < moment(dockerHub.last_updated)) || (system.FIRST_RUN && moment(image.createdAt) < moment(dockerHub.last_updated)));
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
  const { system, options } = app.config();

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
    if (images[i].image === 'jakowenko/watchtower' && !options.AUTO_UPDATE_WATCHTOWER) {
      logger.log('watchtower needs to be recreated manually');
      continue;
    }

    if (images[i].image === 'jakowenko/watchtower' && options.AUTO_UPDATE_WATCHTOWER) {
      system.WATCHTOWER_UPDATE_PENDING = true;
      logger.log('watchtower deferred until end of run');
      app.update({ system });
    } else {
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
  }
  const timer = perf.stop();
  logger.log(`${verb.end} complete in ${this.msToTime(timer.time)}`);
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
    if (image.image === 'jakowenko/watchtower') {
      logger.log('watchtower deferred until end of run');
    } else {
      logger.log(`${image.image}:${image.tag}`);
      const stream = await docker.pull(`${image.image}:${image.tag}`);
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
      });
    }
  }
  const timer = perf.stop();

  logger.log(`${verb.end} complete in ${this.msToTime(timer.time)}`);
};

module.exports.msToTime = (duration) => {
  const digits = 2;
  const seconds = (Math.round(parseFloat(((duration / 1000) * (10 ** digits)).toFixed(11))) / (10 ** digits)).toFixed(digits);
  return `${seconds} ${pluralize('second', seconds)}`;
};

module.exports.time = () => {
  const { options } = app.config();
  return (options.TZ.toLowerCase() === 'utc') ? moment().utc().format(`${options.TIME_FORMAT} UTC`) : moment().tz(options.TZ).format(`${options.TIME_FORMAT} z`);
};
module.exports.formateBtyes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

module.exports.prune = async (skipImageCheck = false) => {
  if (!skipImageCheck) {
    const images = db.updatedImages('download');
    if (!images.length) {
      return;
    }
  }

  const { options } = app.config();

  if (options.PRUNE_IMAGES || options.PRUNE_VOLUMES) {
    if (!skipImageCheck) {
      logger.log(logger.dashes());

      if (options.PRUNE_IMAGES && options.PRUNE_VOLUMES) {
        logger.log('pruning images & volumes');
      } else if (options.PRUNE_IMAGES) {
        logger.log('pruning images');
      } else {
        logger.log('pruning volumes');
      }
    }

    perf.start();
    if (options.PRUNE_IMAGES) {
      const pruned = await docker.pruneImages({ filters: { dangling: { false: true } } });
      const spaceReclaimed = pruned.SpaceReclaimed;
      pruned.ImagesDeleted = (pruned.ImagesDeleted === null) ? [] : pruned.ImagesDeleted;
      if (!skipImageCheck) {
        logger.log(`${pruned.ImagesDeleted.length} ${pluralize('image', pruned.ImagesDeleted.length)} ${(spaceReclaimed > 0) ? `| ${this.formateBtyes(spaceReclaimed)}` : ''}`);
      }
    }

    if (options.PRUNE_VOLUMES) {
      const pruned = await docker.pruneVolumes();
      const spaceReclaimed = pruned.SpaceReclaimed;
      if (!skipImageCheck) {
        logger.log(`${pruned.VolumesDeleted.length} ${pluralize('volume', pruned.VolumesDeleted.length)} ${(spaceReclaimed > 0) ? `| ${this.formateBtyes(spaceReclaimed)}` : ''}`);
      }
    }

    const timer = perf.stop();

    if (!skipImageCheck) {
      logger.log(`pruning complete in ${this.msToTime(timer.time)}`);
    }
  }
};

module.exports.createUpdateContainer = async () => {
  const { WATCHTOWER_UPDATE_PENDING } = app.config().system;
  if (WATCHTOWER_UPDATE_PENDING) {
    const message = 'updating watchtower';
    logger.log(logger.dashes());
    logger.log(message);
    notify.send(`${message}...be right back`);
    const [watchtowerImage] = db.watchtowerImage();
    const container = docker.getContainer(watchtowerImage.containerId);
    const data = await container.inspect();

    const stream = await docker.pull(`${watchtowerImage.image}:${watchtowerImage.tag}`);
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });

    const createOptions = {
      name: 'watchtower-helper', Image: `${watchtowerImage.image}:${watchtowerImage.tag}`, Cmd: ['node', 'index.js', '--update-helper', watchtowerImage.containerId], HostConfig: { Binds: data.HostConfig.Binds },
    };
    const createdContainer = await docker.createContainer(createOptions);
    app.update({ system: { WATCHTOWER_UPDATE_PENDING: false } });
    logger.log('helper container created');
    return createdContainer;
  }
  return false;
};

module.exports.removeUpdateHelper = async () => {
  const containers = await docker.listContainers({ all: true });
  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    const containerName = container.Names[0].replace('/', '');
    if (container.Image.includes('jakowenko/watchtower') && containerName === 'watchtower-helper') {
      const helperContainer = docker.getContainer(container.Id);
      // await helperContainer.remove();
      logger.log('watchtower helper removed');
      logger.log(logger.dashes());
    }
  }
};

module.exports.autoUpdate = async () => {
  const info = { updateReady: false };
  const containers = await docker.listContainers();

  process.argv.forEach((arg) => {
    if (arg.includes('--update-helper')) {
      info.containerId = process.argv[process.argv.indexOf('--update-helper') + 1];
    }
  });

  if (info.containerId === undefined) {
    logger.log('containerId required');
    return;
  }

  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    const containerName = container.Names[0].replace('/', '');
    if (container.Id === info.containerId) {
      info.updateReady = true;
      info.containerId = container.Id;
      info.containerName = containerName;
    }
  }
  if (!info.updateReady) {
    logger.log('watchtower container not found or not running - skipping update');
    return;
  }

  logger.log('starting auto update');

  const container = docker.getContainer(info.containerId);
  const data = await container.inspect();

  const createOptions = {
    name: `${info.containerName}-test`, ...data.Config, HostConfig: data.HostConfig, NetworkingConfig: data.NetworkingConfig,
  };
  // await container.stop(container.Id);
  // await container.remove();
  const createdContainer = await docker.createContainer(createOptions);
  await createdContainer.start();
  logger.log('update complete');
};

module.exports.telemetry = () => {
  console.log('telemetry');
  const { system, options } = app.config();
  if (options.TELEMETRY) {
    axios({
      method: 'post',
      url: 'https://watchtower-api.jako.io/telemetry',
      data: {
        version: system.VERSION,
      },
    }).catch(() => {});
  }
};
