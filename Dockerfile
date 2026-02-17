FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends yt-dlp ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

CMD ["node", "commands/index.js"]
