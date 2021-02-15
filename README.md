[![NPM Version](https://flat.badgen.net/npm/v/@jakowenko/watchtower)](https://www.npmjs.com/package/@jakowenko/watchtower)
[![NPM Downloads](https://flat.badgen.net/npm/dt/@jakowenko/watchtower)](https://www.npmjs.com/package/@jakowenko/watchtower)
[![Docker Pulls](https://flat.badgen.net/docker/pulls/jakowenko/watchtower)](https://hub.docker.com/r/jakowenko/watchtower)

# Watchtower

Watch Docker containers and check for image updates on Docker Hub. Watchtower can be used to monitor for updates or automatically update existing containers with the new image.

This project was inspired by https://github.com/containrrr/watchtower and is not affiliated with it.

```shell
------------------------------------------------
watching 10 containers @ 06/09/2020 01:02:01 EDT
------------------------------------------------
2 updates found
grafana/grafana:latest | 3 hours ago
portainer/portainer:latest | 15 minutes ago
------------------------------------------------
downloading 2 images
grafana/grafana:latest
portainer/portainer:latest
downloads complete in 13.28 seconds
------------------------------------------------
recreating 2 containers
grafana
portainer
recreations complete in 4.57 seconds
------------------------------------------------
pruning images & volumes
2 images | 54.50 MB
0 volumes
pruning complete in 1.02 seconds
-----------------------------------------------
run complete in 19.46 seconds
```

## Install

**Node.js**
`npm install @jakowenko/watchtower`

**Docker**
`docker pull jakowenko/watchtower`

## Usage

**Node.js**

```js
const watchtower = require("@jakowenko/watchtower");

watchtower.run();
```

**Docker**

```shell
docker run -d \
  --name=watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  jakowenko/watchtower
```

```yaml
version: "3.7"

services:
  watchtower:
    container_name: watchtower
    image: jakowenko/watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

## How are updates detected?

There are currently two ways Watchtower checks for image updates.

- If the `last_updated` value on Docker Hub is newer than your containers `createdAt` value.
- If the `last_updated` value on Docker Hub changes while Watchtower is running.

```json
/* Docker Hub API v2 Sample Response Snippet */
{
  "last_updated": "2020-05-28T13:50:21.956701Z",
  "last_updater_username": "jakowenko",
  "name": "latest",
  "images": [
    {
      "architecture": "amd64",
      "features": "",
      "variant": null,
      "os": "linux",
      "os_features": "",
      "os_version": null,
      "size": 380405997
    }
  ],
  "repository": 9138104,
  "full_size": 380405997,
  "v2": true
}
```

Setting a valid `NOTIFY_TYPE` will result in a notification if either of the above conditions are met.

If `NOTIFY_TYPE` is set to `http` then notifications will be POSTed to `NOTIFY_HTTP_URL` with the following payload:

```json
{
  "title": "Watchtower",
  "text": "Sample notification message"
}
```

## Options

| Name                    | Default               | Description                                                                                                              |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| WATCH_ALL               | `true`                | Watch all running containers                                                                                             |
| AUTO_UPDATE             | `false`               | When an update is detected, Watchtower will pull the newest image and recreate the container with the same configuration |
| AUTO_UPDATE_WATCHTOWER  | `true`                | Creates a helper container to aid in updating the Watchtower container                                                   |
| UPDATE_ON_START         | `false`               | Automatically pull new images and recreate all containers when Watchtower starts                                         |
| TIMER                   | `30`                  | Time in minutes before rechecking containers. If set to `0`, Watchtower will only run once                               |
| DB_MEMORY               | `true`                | Whether to store the database in memory or on disk                                                                       |
| PRUNE_IMAGES            | `false`               | Remove all unused images                                                                                                 |
| PRUNE_VOLUMES           | `false`               | Remove all unused local volumes                                                                                          |
| TZ                      | `UTC`                 | Timezone used in logs                                                                                                    |
| TIME_FORMAT             | `MM/DD/YYYY hh:mm:ss` | Format of time used in logging and notifications                                                                         |
| TELEMETRY               | `true`                | Pass telemetry data to help improve Watchtower                                                                           |
| EXTRA_IMAGES            |                       | Comma separated list of Docker Hub images to watch (`cdr/code-server, esphome/esphome:dev`)                              |
| NOTIFY_TYPE             |                       | Type of notification: `http`, `email`                                                                                    |
| NOTIFY_SUBJECT          | `Watchtower`          | Subject value passed in notification                                                                                     |
| NOTIFY_HTTP_URL         |                       | URL POST request is sent to for notifications                                                                            |
| NOTIFY_EMAIL_HOST       |                       | SMTP server to send emails                                                                                               |
| NOTIFY_EMAIL_PORT       | `587`                 | Port used to connect to the SMTP server                                                                                  |
| NOTIFY_EMAIL_IGNORE_TLS | `false`               | Ignore TLS with the SMTP server                                                                                          |
| NOTIFY_EMAIL_USERNAME   |                       | Username to authenticate with the SMTP server                                                                            |
| NOTIFY_EMAIL_PASSWORD   |                       | Password to authenticate with the SMTP server                                                                            |
| NOTIFY_EMAIL_FROM_NAME  | `Notify`              | Sender name for the email notifications                                                                                  |
| NOTIFY_EMAIL_TO         |                       | Email address to which notifications will be sent                                                                        |

## Option Usage

Options are passed to Watchtower with environment variables or by using a `.env` file in the root directory of your project.

**Node.js**

```js
const watchtower = require("@jakowenko/watchtower");

watchtower.run({
  TZ: "America/Detroit",
  PRUNE_IMAGES: true,
  PRUNE_VOLUMES: true,
});
```

**Docker**

```shell
docker run -d \
  --name=watchtower \
  -e TZ=America/Detroit \
  -e PRUNE_IMAGES=true \
  -e PRUNE_VOLUMES=true \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  jakowenko/watchtower
```

```yaml
version: "3.7"

services:
  watchtower:
    container_name: watchtower
    image: jakowenko/watchtower
    restart: unless-stopped
    environment:
      TZ: America/Detroit
      PRUNE_IMAGES: "true"
      PRUNE_VOLUMES: "true"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

## Labels

Labels can used to:

- Include or exclude specific containers from being watched
- Automatically pull the newest image and recreate the container when Watchtower starts

**Enable**

```yaml
version: "3.7"

services:
  example:
    image: example/example-watch
    labels:
      - "watchtower.enable=true"
```

**Disable**

```yaml
version: "3.7"

services:
  example:
    image: example/example-dont-watch
    labels:
      - "watchtower.enable=false"
```

**Update on Start**

```yaml
version: "3.7"

services:
  example:
    image: example/example-watch
    labels:
      - "watchtower.update-on-start=true"
```
