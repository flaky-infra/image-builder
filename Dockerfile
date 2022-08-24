FROM docker:20.10-dind
RUN apk add --update nodejs npm
RUN apk add tar && apk add gzip && wget https://github.com/buildpacks/pack/releases/download/v0.27.0/pack-v0.27.0-linux.tgz && tar -C /usr/local/bin/ --no-same-owner -xzvf pack-v0.27.0-linux.tgz
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
ENV DOCKER_HOST=unix:///var/run/docker.sock

CMD (/usr/local/bin/dockerd-entrypoint.sh > /dev/null 2>&1 &) && node dist/index.js
# CMD npm start
