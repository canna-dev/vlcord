FROM node:18-alpine

WORKDIR /app

# Install dependencies (including tsx for TypeScript support)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .

ENV NODE_ENV=production
EXPOSE 7100
CMD ["npx", "tsx", "src/main.ts"]
