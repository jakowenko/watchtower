
# Watchtower
Used to watch docker containers and check for image updates on Docker Hub.

## Usage

```shell
docker run \
  --name=watchtower \
  -e WATCH_ALL=true \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  jakowenko/watchtower
```

**docker-compose.yml**

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