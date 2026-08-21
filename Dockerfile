FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4380

EXPOSE 4380
USER node

CMD ["node", "--experimental-sqlite", "server/src/index.js"]
