FROM node:18-alpine

WORKDIR /app

# Install only production deps by default
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --production

COPY . .

ENV NODE_ENV=production
EXPOSE 7100
CMD ["node", "src/main.ts"]
