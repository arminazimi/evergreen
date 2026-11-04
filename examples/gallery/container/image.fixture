# syntax=docker/dockerfile:1
FROM node:16 AS deps
RUN npm ci

FROM --platform=linux/amd64 node:16-alpine AS build
COPY --from=deps /app /app

FROM docker.io/library/python:3.8-slim
RUN echo done
