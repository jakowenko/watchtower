const Database = require('better-sqlite3');
const moment = require('moment-timezone');
const logger = require('./logger');
const app = require('./app');

let db;

module.exports.init = () => {
  const { system, options } = app.config();

  if (!system.FIRST_RUN) {
    return;
  }

  if (options.LOGS === 'verbose') {
    logger.log('db init');
  }

  db = (options.DB_MEMORY === true) ? new Database(':memory:') : new Database('data/images.db');

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
  const { options } = app.config();

  this.init();

  if (options.LOGS === 'verbose') {
    logger.log('db upsert images for running containers');
  }

  for (let i = containers.length - 1; i >= 0; i -= 1) {
    if (containers[i].Image.includes('sha256:')) {
      containers.splice(i, 1);
    }
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

  let extraImages = (options.EXTRA_IMAGES !== undefined && options.EXTRA_IMAGES !== '') ? options.EXTRA_IMAGES.split(',') : [];
  extraImages = extraImages.map((image) => {
    const item = { ...insertItem };
    item.image = this.splitImageTag(image.trim()).image;
    item.tag = this.splitImageTag(image.trim()).tag;
    return item;
  });

  let images = [];

  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    const containerName = container.Names[0].replace('/', '');
    if ((options.WATCH_ALL || container.Labels['watchtower.enable'] === 'true') && container.Labels['watchtower.enable'] !== 'false') {
      const item = { ...insertItem };
      item.containerId = container.Id;
      item.containerName = containerName;
      item.createdAt = moment.unix(container.Created).utc().format();
      if (container.Labels['watchtower.update-on-start'] === 'true' || options.UPDATE_ON_START) {
        item.createdAt = 0;
      }
      item.image = this.splitImageTag(container.Image).image;
      item.tag = this.splitImageTag(container.Image).tag;

      if (item.image === 'jakowenko/watchtower' && item.containerName === 'watchtower-helper') {
        continue;
      }
      images.push(item);
    }
  }

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
  const { options } = app.config();
  if (options.LOGS === 'verbose') {
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

module.exports.updatedImages = (type = null) => {
  const query = (type === 'restart' || type === 'download') ? 'WHERE containerId IS NOT NULL AND isUpdated = 1' : 'WHERE isUpdated = 1';
  const images = db.prepare(`SELECT * FROM images ${query}`).all();
  return images;
};

module.exports.watchtowerImage = () => {
  const image = db.prepare('SELECT * FROM images WHERE image = \'jakowenko/watchtower\'').all();
  return image;
};

module.exports.clearUpdatedImages = () => {
  db.prepare('UPDATE images SET isUpdated = 0').run();
};

module.exports.splitImageTag = (img) => {
  const image = (img.includes('/') ? '' : 'library/') + img.split(':')[0];
  const tag = (img.split(':')[1] === undefined) ? 'latest' : img.split(':')[1];
  return { image, tag };
};
