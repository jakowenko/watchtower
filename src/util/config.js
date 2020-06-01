module.exports = () => {
  const { env } = process;
  const config = {
    TZ: (env.TZ === undefined) ? 'UTC' : env.TZ,
    NOTIFY_TYPE: env.NOTIFY_TYPE,
    NOTIFY_HTTP_URL: env.NOTIFY_HTTP_URL,
    NOTIFY_SUBJECT: (env.NOTIFY_SUBJECT === undefined) ? 'Watchtower' : env.NOTIFY_SUBJECT,
    NOTIFY_EMAIL_HOST: env.NOTIFY_EMAIL_HOST,
    NOTIFY_EMAIL_PORT: (env.NOTIFY_EMAIL_PORT === undefined) ? 587 : parseFloat(env.NOTIFY_EMAIL_PORT),
    NOTIFY_EMAIL_USERNAME: env.NOTIFY_EMAIL_USERNAME,
    NOTIFY_EMAIL_PASSWORD: env.NOTIFY_EMAIL_PASSWORD,
    NOTIFY_EMAIL_FROM_NAME: (env.NOTIFY_EMAIL_FROM_NAME === undefined) ? 'Notify' : env.NOTIFY_EMAIL_FROM_NAME,
    NOTIFY_EMAIL_TO: env.NOTIFY_EMAIL_TO,
  };
  if (env.ENV === 'local') {
    console.log(config);
  }
  return config;
};