
# Watchtower
Watch Docker containers and check for image updates on Docker Hub.

This project was inspired by [containrrr/watchtower](https://github.com/containrrr/watchtower) and only watches for changes from the Docker Hub API versus pulling down the image to compare it.

```shell
watching 5 containers @ 06/03/2020 05:09:33 UTC
----------------------------------------------
2 updates found:
  * portainer/portainer:latest | a day ago
  * jakowenko/watchtower:dev | 13 minutes ago
```

## Install

**Node.js**
`npm install watchtower-docker`

**Docker**
`docker pull jakowenko/watchtower`

## Usage

**Node.js**
```js
const watchtower = require('watchtower-docker');

watchtower.run();
```

**Docker**
```shell
docker run \
  --name=watchtower \
  -e WATCH_ALL=true \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  jakowenko/watchtower
```

```yaml
version: '3.7'

services:
  watchtower:
    container_name: watchtower
    image: jakowenko/watchtower
    restart: unless-stopped
    environment:
      WATCH_ALL: 'true'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - $PWD/watchtower:/usr/src/data # optional for persistent database
```

## What triggers notifications?
There are currently two ways notifications can be triggered.

 - If the `last_updated` value on Docker Hub is newer than your containers `createdAt` value.
 - If the `last_updated` value on Docker Hub changes while Watchtower is running.

```json
/* Docker Hub API v2 Sample Response Snippet */
{
	"last_updated": "2020-05-28T13:50:21.956701Z",
	"last_updater_username": "jakowenko",
	"name": "latest",
	"images": [{
		"architecture": "amd64",
		"features": "",
		"variant": null,
		"os": "linux",
		"os_features": "",
		"os_version": null,
		"size": 380405997
	}],
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

| Name | Default | Description |
|--|--|--|
| WATCH_ALL | `false` | Watch all running containers |
| TIMER | `30` | Time in minutes before rechecking containers. If set to `0`, Watchtower will only run once |
| DB_MEMORY | `false` | Whether to store the database in memory or on disk |
| TZ | `UTC` |Timezone used in logs |
| IMAGES || Comma separated list of extra Docker Hub images to watch (`cdr/code-server, esphome/esphome:dev`)
| NOTIFY_TYPE ||Type of notification: `http`, `email` |
| NOTIFY_SUBJECT | `Watchtower` | Subject value passed in notification |
| NOTIFY_HTTP_URL || URL POST request is sent to for notifications |
| NOTIFY_EMAIL_HOST || SMTP server to send emails |
| NOTIFY_EMAIL_PORT | `587` | Port used to connect to the SMTP server |
| NOTIFY_EMAIL_USERNAME || Username to authenticate with the SMTP server |
| NOTIFY_EMAIL_PASSWORD || Password to authenticate with the SMTP server |
| NOTIFY_EMAIL_FROM_NAME | `Notify` | Sender name for the email notifications |
| NOTIFY_EMAIL_TO || Email address to which notifications will be sent |

## Labels

Labels can be used on containers to include or exclude them from being watched.

**Enable**

```yaml
version: '3.7'

services:
  example:
    image: example/example-watch
    labels:
      - 'watchtower.enable=true'
```
**Disable**
```yaml
version: '3.7'

services:
  example:
    image: example/example-dont-watch
    labels:
      - 'watchtower.enable=false'
```