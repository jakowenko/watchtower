FROM node:12-alpine
RUN apk update && apk add bash python make g++ && rm -rf /var/cache/apk/*
VOLUME /user/watchtower/data
WORKDIR /usr/watchtower
COPY package.json index.js /usr/watchtower/
RUN npm install
CMD ["npm", "start"]