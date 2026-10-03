FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY shared shared
COPY server/src server/src
WORKDIR /app/server
ENV DATA_DIR=/data PORT=2567
VOLUME /data
EXPOSE 2567
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "src/index.ts"]
