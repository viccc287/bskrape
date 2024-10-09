FROM ghcr.io/puppeteer/puppeteer:23.5.1

ENV PUPPETEER_SKIP_DOWNLOAD true\
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

    WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "server.js"]