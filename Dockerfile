FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --chown=node:node public ./public
COPY --chown=node:node server ./server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4380

EXPOSE 4380
USER node

CMD ["node", "server/src/index.js"]
