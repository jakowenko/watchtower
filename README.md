<img src="https://jakowenko.com/watchtower/push.jpg" width="325" align="right">

# Watchtower
Watch Docker containers and check for image updates on Docker Hub.

This project was inspired by [containrrr/watchtower](https://github.com/containrrr/watchtower) and only watches for changes from the Docker Hub API versus pulling down the image to compare it.

```shell
docker logs watchtower 

watching 18 containers @ 05/28/2020 11:35:05 EDT
2 updates found:
- jakowenko/watchtower:dev
- oznu/homebridge:latest
```

## What triggers an update message?
There are two ways an update message can be triggered.

 - If the `last_updated` value on Docker Hub is newer than your containers `createdAt` value.
 - If the `last_updated` value on Docker Hub changes while Watchtower is running.

```json
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
	"v2": true,
	...
}
```



## Usage

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

## Options

| Name | Default | Description |
|--|--|--|
| TIMER | `30` | Time in minutes before rechecking containers |
| WATCH_ALL | `false` | Watch all running containers |
| TZ | `UTC` |Timezone used in logs |
| IMAGES || Comma separated list of extra Docker Hub images to watch (`cdr/code-server, esphome/esphome:dev`)
| NOTIFY_TYPE ||Type of notification: `http` |
| NOTIFY_HTTP_URL || URL POST request is sent to for notifications |
| NOTIFY_SUBJECT | `Watch` | Subject value passed in notification |

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
