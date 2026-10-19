FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/client/package.json packages/client/
COPY packages/web/package.json packages/web/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages packages
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST_DIR=/app/packages/web/dist

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/api/package.json packages/api/
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/packages/client/package.json packages/client/
COPY --from=build /app/packages/client/dist packages/client/dist
COPY --from=build /app/packages/web/dist packages/web/dist

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "packages/api/dist/server.js"]
