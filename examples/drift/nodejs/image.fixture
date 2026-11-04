FROM node:22-alpine AS build
RUN npm ci

FROM node:24-alpine
COPY --from=build /app /app
