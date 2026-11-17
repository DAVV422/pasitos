# El build del trabajador (dist/apps/trabajador, con su package.json y su lockfile podados).
FROM node:24-slim
WORKDIR /app
COPY app/ ./
# El lockfile podado de Nx sale incompleto: se instala con npm desde el package.json (versiones fijas).
RUN rm -f pnpm-lock.yaml pnpm-workspace.yaml && npm install --omit=dev --no-audit --no-fund
USER node
CMD ["node", "main.js"]
