const Database = require('better-sqlite3');
const moment = require('moment-timezone');
const app = require('./app');
const helper = require('./helper');
const logger = require('./logger');

const db = this;
let connection;

module.exports.init = () => {
  const { system, options } = app.config();

  if (!system.FIRST_RUN) {
    return;
  }

  if (options.LOGS === 'verbose') {
    logger.log('db init');
  }

  connection = (options.DB_MEMORY === true) ? new Database(':memory:') : new Database('data/images.db');
  connection.prepare('DROP TABLE IF EXISTS containers').run();
  connection.prepare(`CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    containerId,
    containerName,
    image,
    tag,
    dockerHubLastUpdated TIMESTAMP,
    createdAt TIMESTAMP,
    isActive TINYINT,
    isUpdated TINYINT,
    UNIQUE(image, tag)
  )`).run();
};

module.exports.insert = (containers) => {
  const { options } = app.config();

  db.init();

  if (options.LOGS === 'verbose') {
    logger.log('db upsert images for running containers');
  }

  for (let i = containers.length - 1; i >= 0; i -= 1) {
    if (containers[i].Image.includes('sha256:')) {
      containers.splice(i, 1);
    }
  }

  const insertObj = {
    id: null,
    containerId: null,
    containerName: null,
    dockerHubLastUpdated: null,
    isActive: 1,
    isUpdated: 0,
    createdAt: null,
  };

  connection.prepare('UPDATE containers SET isActive = 0').run();

  let extraImages = (options.EXTRA_IMAGES !== undefined && options.EXTRA_IMAGES !== '') ? options.EXTRA_IMAGES.split(',') : [];
  extraImages = extraImages.map((image) => {
    const item = { ...insertObj };
    item.image = helper.splitImageTag(image.trim()).image;
    item.tag = helper.splitImageTag(image.trim()).tag;
    return item;
  });

  let allContainers = [];
  containers.forEach((container) => {
    const containerName = container.Names[0].replace('/', '');
    if ((options.WATCH_ALL || container.Labels['watchtower.enable'] === 'true') && container.Labels['watchtower.enable'] !== 'false') {
      const item = { ...insertObj };
      item.containerId = container.Id;
      item.containerName = containerName;
      item.createdAt = moment.unix(container.Created).utc().format();
      if (container.Labels['watchtower.update-on-start'] === 'true' || options.UPDATE_ON_START) {
        item.createdAt = 0;
      }
      item.image = helper.splitImageTag(container.Image).image;
      item.tag = helper.splitImageTag(container.Image).tag;

      if (item.image === 'jakowenko/watchtower' && item.containerName === 'watchtower-helper') {
        return;
      }
      allContainers.push(item);
    }
  });
  allContainers = allContainers.concat(extraImages);

  const insert = connection.prepare(`
    INSERT INTO containers
    VALUES (:id, :containerId, :containerName, :image, :tag, :dockerHubLastUpdated, :createdAt, :isActive, :isUpdated)
    ON CONFLICT(image, tag) DO UPDATE SET containerId = :containerId, containerName = :containerName, createdAt = :createdAt, isActive = 1;
  `);
  const insertContainers = connection.transaction((allContainers) => {
    for (const container of allContainers) insert.run(container);
  });
  insertContainers(allContainers);

  return allContainers;
};

module.exports.containers = (type) => {
  if (type === 'active') {
    return connection.prepare('SELECT * FROM containers WHERE isActive = 1').all();
  }
  if (type === 'updated') {
    return connection.prepare('SELECT * FROM containers WHERE isUpdated = 1').all();
  }
  if (type === 'restart' || type === 'download') {
    return connection.prepare('SELECT * FROM containers WHERE containerId IS NOT NULL AND isUpdated = 1').all();
  }
  if (type === 'watchtower') {
    return connection.prepare('SELECT * FROM containers WHERE image = \'jakowenko/watchtower\'').get();
  }
  return false;
};

module.exports.update = (containers) => {
  const { options } = app.config();
  if (options.LOGS === 'verbose') {
    logger.log('db updated with newest api data');
  }
  const values = [];
  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    if (container.isUpdated || container.dockerHubLastUpdated === null) {
      values.push({
        id: container.id,
        dockerHubNewTime: container.dockerHubNewTime,
        isUpdated: (container.isUpdated) ? 1 : 0,
      });
    }
  }
  const update = connection.prepare('UPDATE containers SET dockerHubLastUpdated = :dockerHubNewTime, isUpdated = :isUpdated WHERE id = :id');
  const updateContainers = connection.transaction((containers) => {
    for (const container of containers) update.run(container);
  });
  updateContainers(values);
};

module.exports.reset = () => {
  connection.prepare('UPDATE containers SET isUpdated = 0').run();
};
