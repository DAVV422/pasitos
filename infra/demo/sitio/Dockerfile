# El sitio público con SSR (dist/apps/sitio): el servidor ya trae sus dependencias.
FROM node:24-slim
WORKDIR /app
COPY app/ ./
USER node
CMD ["node", "server/server.mjs"]
