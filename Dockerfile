FROM node:12-alpine
RUN apk update && apk add python make g++ && rm -rf /var/cache/apk/*
VOLUME /user/src/data
WORKDIR /usr/src
COPY src/ /usr/src/
RUN npm install
CMD ["npm", "run", "start"]