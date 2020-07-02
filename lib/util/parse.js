module.exports.containers = (opts, containers) => {
  let selection = false;
  containers.forEach((container) => {
    const name = container.Names[0].replace('/', '');
    if (opts.operator === '=' && container.Image.includes(opts.image) && name === opts.name) {
      selection = container;
    }
    if (opts.operator === '!=' && container.Image.includes(opts.image) && name !== opts.name) {
      selection = container;
    }
  });
  return selection;
};
