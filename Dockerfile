FROM node:22-slim

RUN apt-get update \
  && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/flexi.db
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
