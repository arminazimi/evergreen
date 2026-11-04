# syntax=docker/dockerfile:1
FROM node:22 AS build
RUN npm ci

FROM --platform=linux/amd64 node:22 AS runtime
COPY --from=build /app /app
CMD ["node", "app.js"]

FROM python:3.9-slim AS tools
RUN pip install --no-cache-dir -r requirements.txt

FROM node:20-alpine AS edge
RUN npm ci

FROM node:20@sha256:0000000000000000000000000000000000000000000000000000000000000000 AS pinned
RUN node --version
