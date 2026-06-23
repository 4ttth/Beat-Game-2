FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Persistent directories (mounted as volumes at runtime)
RUN mkdir -p /app/levels

EXPOSE 3001

CMD ["node", "src/index.js"]
