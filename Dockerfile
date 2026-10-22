# ---- build ----
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=4173 \
    HOST=0.0.0.0 \
    DB_FILE=/data/nivora.db \
    COOKIE_SECURE=false

WORKDIR /app

# Tiada dependency luar: hanya salin kod.
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 4173
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
