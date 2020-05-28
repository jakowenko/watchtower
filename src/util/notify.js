const axios = require('axios');

module.exports.post = async (config, message) => {
  await axios({
    method: 'post',
    url: config.httpUrl,
    data: {
      title: config.subject,
      text: message,
    },
  });
};

module.exports.log = (message) => {
  console.log(message);
};
