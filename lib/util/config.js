require('dotenv').config();

module.exports = () => {
  const { env } = process;
  const config = {
    TZ: (env.TZ === undefined) ? 'UTC' : env.TZ,
    TIMER: (env.TIMER === undefined) ? 30 : parseFloat(env.TIMER),
    NOTIFY_TYPE: env.NOTIFY_TYPE,
    NOTIFY_HTTP_URL: env.NOTIFY_HTTP_URL,
    NOTIFY_SUBJECT: (env.NOTIFY_SUBJECT === undefined) ? 'Watchtower' : env.NOTIFY_SUBJECT,
    NOTIFY_EMAIL_HOST: env.NOTIFY_EMAIL_HOST,
    NOTIFY_EMAIL_PORT: (env.NOTIFY_EMAIL_PORT === undefined) ? 587 : parseFloat(env.NOTIFY_EMAIL_PORT),
    NOTIFY_EMAIL_USERNAME: env.NOTIFY_EMAIL_USERNAME,
    NOTIFY_EMAIL_PASSWORD: env.NOTIFY_EMAIL_PASSWORD,
    NOTIFY_EMAIL_FROM_NAME: (env.NOTIFY_EMAIL_FROM_NAME === undefined) ? 'Notify' : env.NOTIFY_EMAIL_FROM_NAME,
    NOTIFY_EMAIL_TO: env.NOTIFY_EMAIL_TO,
    DB_MEMORY: env.DB_MEMORY,
    LOGS: env.LOGS,
    ENV: (env.ENV === 'local') ? 'local' : 'prod',
  };
  return config;
};
