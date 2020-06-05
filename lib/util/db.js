const fs = require('fs');
const Database = require('better-sqlite3');
const moment = require('moment-timezone');
const logger = require('./logger');
const config = require('./config')();
const { app } = require('./watchtower');

let db;

module.exports.init = () => {
  if (!app.SYSTEM_FIRST_RUN) {
    return;
  }

  if (config.LOGS === 'verbose') {
    logger.log('db init');
  }
  if (!fs.existsSync('data') && !config.DB_MEMORY) {
    fs.mkdirSync('data');
  }
  db = (config.DB_MEMORY === true) ? new Database(':memory:') : new Database('data/images.db');

  db.prepare('DROP TABLE IF EXISTS images').run();
  db.prepare(`CREATE TABLE IF NOT EXISTS images (
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
  if (config.LOGS === 'verbose') {
    logger.log('db upsert images for running containers');
  }
  const insertItem = {
    id: null,
    containerId: null,
    containerName: null,
    dockerHubLastUpdated: null,
    isActive: 1,
    isUpdated: 0,
    createdAt: null,
  };

  db.prepare('UPDATE images SET isActive = 0').run();

  let extraImages = (process.env.IMAGES !== undefined && process.env.IMAGES !== '') ? process.env.IMAGES.split(',') : [];
  extraImages = extraImages.map((image) => {
    const item = { ...insertItem };
    item.image = this.splitImageTag(image.trim()).image;
    item.tag = this.splitImageTag(image.trim()).tag;
    return item;
  });

  let images = [];

  containers.forEach((container) => {
    if ((process.env.WATCH_ALL === 'true' || container.Labels['watchtower.enable'] === 'true') && container.Labels['watchtower.enable'] !== 'false') {
      const item = { ...insertItem };
      item.containerId = container.Id;
      item.containerName = container.Names[0].replace('/', '');
      item.createdAt = moment.unix(container.Created).utc().format();
      if (container.Labels['watchtower.force-update'] === 'true') {
        item.createdAt = 0;
      }
      item.image = this.splitImageTag(container.Image).image;
      item.tag = this.splitImageTag(container.Image).tag;
      images.push(item);
    }
  });

  images = images.concat(extraImages);

  const insert = db.prepare(`
    INSERT INTO images
    VALUES (:id, :containerId, :containerName, :image, :tag, :dockerHubLastUpdated, :createdAt, :isActive, :isUpdated)
    ON CONFLICT(image, tag) DO UPDATE SET containerId = :containerId, containerName = :containerName, createdAt = :createdAt, isActive = 1;
  `);
  const insertImages = db.transaction((images) => {
    for (const image of images) insert.run(image);
  });
  insertImages(images);

  return images;
};

module.exports.select = () => {
  const images = db.prepare('SELECT * FROM images WHERE isActive = 1').all();
  return images;
};

module.exports.update = (images) => {
  if (config.LOGS === 'verbose') {
    logger.log('db updated with newest api data');
  }
  const values = [];
  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    if (image.isUpdated || image.dockerHubLastUpdated === null) {
      values.push({
        id: image.id,
        dockerHubNewTime: image.dockerHubNewTime,
        isUpdated: (image.isUpdated) ? 1 : 0,
      });
    }
  }
  const update = db.prepare('UPDATE images SET dockerHubLastUpdated = :dockerHubNewTime, isUpdated = :isUpdated WHERE id = :id');
  const updateImages = db.transaction((images) => {
    for (const image of images) update.run(image);
  });
  updateImages(values);
};

module.exports.updatedImages = () => {
  const images = db.prepare('SELECT * FROM images WHERE isUpdated = 1').all();
  return images;
};

module.exports.clearUpdatedImages = () => {
  db.prepare('UPDATE images SET isUpdated = 0').run();
};

module.exports.splitImageTag = (img) => {
  const image = (img.includes('/') ? '' : 'library/') + img.split(':')[0];
  const tag = (img.split(':')[1] === undefined) ? 'latest' : img.split(':')[1];
  return { image, tag };
};
