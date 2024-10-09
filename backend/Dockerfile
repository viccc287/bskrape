FROM ghcr.io/puppeteer/puppeteer:23.5.1

ENV PUPPETEER_SKIP_DOWNLOAD=true\
    PUPPETEER_EXECUTABLE_PATH=google-chrome-stable

    WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "server.js"]