# Build bằng Vite rồi phục vụ bằng nginx (nginx cũng chuyển /ws sang game server)
FROM node:22-alpine AS build
WORKDIR /app
COPY client/package.json client/
RUN cd client && npm install --no-audit --no-fund
COPY shared shared
COPY client client
RUN cd client && npm run build

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
