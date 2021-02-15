const axios = require('axios');
const Docker = require('dockerode');
const moment = require('moment-timezone');
const perf = require('execution-time')();
const pluralize = require('pluralize');
const app = require('./util/app');
const db = require('./util/db');
const dockerhub = require('./util/dockerhub');
const helper = require('./util/helper');
const logger = require('./util/logger');
const notify = require('./util/notify');
const to = require('./util/to');
const update = require('./util/update');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const watchtower = this;

module.exports.run = async (opts = {}) => {
  if (update.check()) {
    await update.queue();
    return;
  }

  const { system, options } = (opts.cron) ? app.config() : app.init(opts);

  perf.start('watchtower');

  if (system.FIRST_RUN && (options.ENV === 'local' || options.LOGS === 'verbose')) {
    logger.log({ system, options });
  }

  const containers = db.insert(await docker.listContainers());
  watchtower.telemetry(containers);
  system.STATUS = `watching ${containers.length} ${pluralize('container', containers.length)} @ ${helper.time()}`;
  app.update({ system, options });

  if (system.FIRST_RUN) {
    logger.log(logger.dashes());
    logger.log(`v${system.VERSION}`);
    logger.log(logger.dashes());
    await update.removeContainer();
    watchtower.prune(true);
  } else {
    logger.log(logger.dashes());
  }
  logger.log(system.STATUS, { bold: true, color: 'green' });

  const active = db.containers('active');
  if (active.length) {
    db.update(await dockerhub.check(active));
    await watchtower.updates();
    await watchtower.download();
    await watchtower.restart();
    await watchtower.prune();
    db.reset();
  }
  await update.createContainer();

  if (system.FIRST_RUN) {
    app.update({ system: { FIRST_RUN: false } });
  }

  const timer = perf.stop('watchtower');
  logger.log(logger.dashes());
  logger.log(`run complete in ${helper.msToTime(timer.time)}`, { bold: true, color: 'green' });

  await watchtower.cron();
  await watchtower.stop();
};

module.exports.cron = async () => {
  if (app.options().TIMER > 0) {
    setTimeout(async () => {
      await watchtower.run({ cron: true });
    }, app.options().TIMER * 60 * 1000);
  }
};

module.exports.stop = async () => {
  const { system, options } = app.config();
  if (system.DOCKER && options.TIMER === 0) {
    const watchtowerContainer = db.containers('watchtower');
    if (!watchtowerContainer) {
      return;
    }
    const container = docker.getContainer(watchtowerContainer.containerId);
    const [error] = await to(container.stop());
    if (!error) {
      logger.log(logger.dashes());
      logger.log('watchtower container stopped');
    }
  }
};

module.exports.download = async () => {
  const { options } = app.config();
  if (!options.AUTO_UPDATE && !options.UPDATE_ON_START) {
    return;
  }
  const containers = db.containers('download');
  const verb = {
    start: pluralize('images', containers.length),
    end: pluralize('download', containers.length),
  };
  const message = `downloading ${containers.length} ${verb.start}`;
  if (!containers.length) {
    return;
  }

  logger.log(logger.dashes());
  logger.log(message);

  perf.start();
  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    if (container.image === 'jakowenko/watchtower') {
      if (options.AUTO_UPDATE_WATCHTOWER) {
        logger.log('watchtower deferred until end of run');
      } else {
        logger.log('watchtower needs to be downloaded manually');
      }
    } else {
      logger.log(`${container.image}:${container.tag}`);
      const stream = await docker.pull(`${container.image}:${container.tag}`);
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
      });
    }
  }
  const timer = perf.stop();

  logger.log(`${verb.end} complete in ${helper.msToTime(timer.time)}`);
};

module.exports.restart = async () => {
  const { system, options } = app.config();

  if (!options.AUTO_UPDATE && !options.UPDATE_ON_START) {
    return;
  }

  const containers = db.containers('restart');
  const verb = {
    start: pluralize('container', containers.length),
    end: pluralize('recreation', containers.length),
  };
  const message = `recreating ${containers.length} ${verb.start}`;
  if (!containers.length) {
    return;
  }

  logger.log(logger.dashes());
  logger.log(message);

  perf.start();
  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    if (container.image === 'jakowenko/watchtower' && !options.AUTO_UPDATE_WATCHTOWER) {
      logger.log('watchtower needs to be recreated manually');
      continue;
    }
    if (container.image === 'jakowenko/watchtower' && options.AUTO_UPDATE_WATCHTOWER) {
      system.WATCHTOWER_UPDATE_PENDING = true;
      logger.log('watchtower deferred until end of run');
      app.update({ system });
    } else {
      const current = docker.getContainer(container.containerId);
      const data = await current.inspect();
      const createOptions = {
        name: container.containerName, ...data.Config, HostConfig: data.HostConfig, NetworkingConfig: data.NetworkingConfig,
      };
      logger.log(`${createOptions.name}`);
      await current.remove({ force: true });
      const createdContainer = await docker.createContainer(createOptions);
      await createdContainer.start();
    }
  }
  const timer = perf.stop();
  logger.log(`${verb.end} complete in ${helper.msToTime(timer.time)}`);
};

module.exports.updates = async () => {
  const { system, options } = app.config();
  const message = { log: null, notify: null };
  const containers = db.containers('updated');
  if (!containers.length) {
    message.log = 'no updates found';
    message.notify = (system.FIRST_RUN) ? `${system.STATUS}\n${message.log}` : message.log;
  } else if (!system.FIRST_RUN || !options.UPDATE_ON_START) {
    const formatted = containers.map((container) => `${container.image}:${container.tag} | ${moment(container.dockerHubLastUpdated).fromNow()}`);
    message.notify = `${containers.length} ${pluralize('update', containers.length)} found\n${formatted.join('\n')}`;
    message.notify = (system.FIRST_RUN) ? `${system.STATUS}\n${message.notify}` : message.notify;
    message.log = `${containers.length} ${pluralize('update', containers.length)} found\n`;
    message.log += `${formatted.join('\n')}`;
  }
  if (message.log !== null) {
    logger.log(logger.dashes());
    logger.log(message.log);
  }

  if (containers.length || system.FIRST_RUN) {
    notify.send(message.notify);
  }

  return containers;
};

module.exports.prune = async (override = false) => {
  if (!override) {
    const containers = db.containers('download');
    if (!containers.length) {
      return;
    }
  }

  const { options } = app.config();

  if (options.PRUNE_IMAGES || options.PRUNE_VOLUMES) {
    if (!override) {
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
      if (!override) {
        logger.log(`${pruned.ImagesDeleted.length} ${pluralize('image', pruned.ImagesDeleted.length)} ${(spaceReclaimed > 0) ? `| ${helper.formateBtyes(spaceReclaimed)}` : ''}`);
      }
    }

    if (options.PRUNE_VOLUMES) {
      const pruned = await docker.pruneVolumes();
      const spaceReclaimed = pruned.SpaceReclaimed;
      if (!override && pruned.VolumesDeleted) {
        logger.log(`${pruned.VolumesDeleted.length} ${pluralize('volume', pruned.VolumesDeleted.length)} ${(spaceReclaimed > 0) ? `| ${helper.formateBtyes(spaceReclaimed)}` : ''}`);
      }
    }

    const timer = perf.stop();

    if (!override) {
      logger.log(`pruning complete in ${helper.msToTime(timer.time)}`);
    }
  }
};

module.exports.telemetry = (containers = []) => {
  const { system, options } = app.config();
  if (options.TELEMETRY) {
    const images = containers.map((container) => ({
      image: `${container.image}:${container.tag}`,
    }));
    axios({
      method: 'post',
      url: 'https://watchtower-api.jako.io/telemetry',
      data: {
        version: system.VERSION,
        images: JSON.stringify(images),
      },

    }).catch(() => {});
  }
};
