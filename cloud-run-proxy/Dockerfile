FROM ghcr.io/puppeteer/puppeteer:24.43.1

USER root
WORKDIR /app
COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer
RUN npm ci --omit=dev
COPY server.js ./
RUN chown -R pptruser:pptruser /app

ENV NODE_ENV=production
ENV XDG_CONFIG_HOME=/tmp/.chromium
ENV XDG_CACHE_HOME=/tmp/.chromium
USER pptruser
CMD ["npm", "start"]
