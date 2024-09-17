FROM --platform=linux/arm64 node:20-slim AS dependencies
WORKDIR /app
COPY ./package.json ./package.json
RUN npm install

FROM --platform=linux/arm64 node:20-slim
WORKDIR /app
ENV NODE_ENV production
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node ./package.json ./package.json
COPY --chown=node:node ./credentials/ ./credentials/
COPY --chown=node:node ./interface/ ./interface/
COPY --chown=node:node ./logic/ ./logic/
COPY --chown=node:node ./routes/ ./routes/
COPY --chown=node:node ./utility/ ./utility/
COPY --chown=node:node ./arbuscular.yaml ./arbuscular.yaml
COPY --chown=node:node ./database.yaml ./database.yaml
COPY --chown=node:node ./log.yaml ./log.yaml
USER node
EXPOSE 3000
CMD [ "npm", "start" ]