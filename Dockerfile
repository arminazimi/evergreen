FROM node:25-trixie-slim@sha256:aabbe39553d15ede8a97cc60c9e1a97034ff772afcf696ea42b94e7f5f2ec71b AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY tools ./tools
COPY examples ./examples
COPY tests ./tests
COPY benchmarks ./benchmarks
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM gcr.io/distroless/nodejs24-debian13:nonroot
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/src ./dist/src
COPY package.json ./
COPY registry ./registry
COPY data ./data
COPY schemas ./schemas
WORKDIR /workspace
ENTRYPOINT ["/nodejs/bin/node", "/app/dist/src/cli.js"]
CMD ["--help"]
