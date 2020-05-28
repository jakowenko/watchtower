FROM node:12
VOLUME /user/src/data
WORKDIR /usr/src

COPY src/ /usr/src/

RUN npm install

CMD ["npm", "run", "start"]