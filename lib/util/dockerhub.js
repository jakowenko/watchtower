const axios = require('axios');
const moment = require('moment-timezone');
const app = require('./app');
const logger = require('./logger');

module.exports.check = async (containers) => {
  const { system } = app.config();

  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    try {
      const response = await axios({
        method: 'get',
        url: `https://hub.docker.com/v2/repositories/${container.image}/tags/${container.tag}`,
      });
      const dockerhub = response.data;
      if (dockerhub.name === container.tag) {
        container.isUpdated = (
          (moment(container.dockerHubLastUpdated) < moment(dockerhub.last_updated))
          || (system.FIRST_RUN && moment(container.createdAt) < moment(dockerhub.last_updated))
        );
        container.dockerHubNewTime = dockerhub.last_updated;
      }
    } catch (error) {
      logger.log(`${container.image}:${container.tag} - error pulling tag`);
      continue;
    }
  }

  return containers;
};
