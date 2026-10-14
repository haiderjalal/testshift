# Playwright's image ships Chromium and the system libraries it needs, so the worker processes can launch a browser on
# Heroku. The tag must match the `playwright` version in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

# devDependencies stay installed because `next build` needs them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Set after the build: Heroku does not pass config vars to Docker builds. NODE_ENV also turns on strict database TLS
# verification, so it must be production at runtime.
ENV NODE_ENV=production

CMD ["npm", "start"]
