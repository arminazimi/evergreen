FROM node:26-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS build
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

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b8cec4b2f2126ff7bd034ec9ac207ffb3272667dfdc48376e3b035d3270549ba
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
