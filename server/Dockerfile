# PokéTFT shadow/game server — Cloud Run container.
# CPU-always + min-instances=1 (set at deploy) lets the RTDB watcher run continuously.
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "shadow.mjs"]
