const fs = require('fs');
const Database = require('better-sqlite3');
const moment = require('moment-timezone');

let db;

module.exports.init = () => {
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
  }
  db = new Database('data/images.db');

  db.prepare(`CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image UNIQUE,
    dockerHubLastUpdated TIMESTAMP,
    createdAt TIMESTAMP,
    isActive TINYINT,
    isUpdated TINYINT
  )`).run();

  db.prepare('UPDATE images SET isActive = 0').run();
};

module.exports.insert = (containers) => {
  const insertItem = {
    id: null,
    dockerHubLastUpdated: null,
    isActive: 1,
    isUpdated: 0,
  };

  let extraImages = (process.env.IMAGES !== undefined && process.env.IMAGES !== '') ? process.env.IMAGES.split(',') : [];
  extraImages = extraImages.map((image) => {
    const item = { ...insertItem };
    item.createdAt = null;
    item.image = image.trim();
    return item;
  });

  let images = [];

  containers.forEach((container) => {
    if ((process.env.WATCH_ALL === 'true' || container.data.Labels['watchtower.enable'] === 'true') && container.data.Labels['watchtower.enable'] !== 'false') {
      // console.log(container);
      const item = { ...insertItem };
      item.createdAt = moment.unix(container.data.Created).utc().format();
      item.image = container.data.Image;
      images.push(item);
    }
  });

  images = images.concat(extraImages);

  const insert = db.prepare(`
    INSERT INTO images
    VALUES (:id, :image, :dockerHubLastUpdated, :createdAt, :isActive, :isUpdated)
    ON CONFLICT(image) DO UPDATE SET createdAt = :createdAt, isActive = 1;
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
  db.prepare('UPDATE images SET isUpdated = 0').run();
  return images;
};
