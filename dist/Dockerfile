FROM node:12-alpine
VOLUME /user/watchtower/data
WORKDIR /usr/watchtower
COPY index.js /usr/watchtower/
RUN apk update && apk add bash python make g++ && rm -rf /var/cache/apk/* && \
  npm init -y && \
  npm install @jakowenko/watchtower
CMD ["node", "index.js"]