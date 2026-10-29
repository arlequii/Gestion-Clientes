# Imagen de la aplicación. Node 22 (versión LTS) sobre Alpine, que es ligera.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Primero solo los ficheros de dependencias: así Docker reutiliza esta capa
# mientras las dependencias no cambien, aunque cambie el código.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY migraciones ./migraciones
COPY scripts ./scripts
COPY tests ./tests
COPY datos ./datos

# La aplicación no necesita permisos de administrador.
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
