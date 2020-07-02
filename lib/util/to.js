module.exports = (promise, improved) => promise
  .then((data) => [null, data])
  .catch((err) => {
    if (improved) {
      Object.assign(err, improved);
    }

    return [err]; // which is same as [err, undefined];
  });
