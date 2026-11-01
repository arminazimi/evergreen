FROM node:18-alpine AS build
RUN npm ci

FROM node:22-alpine
COPY --from=build /app /app
