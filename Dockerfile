FROM node:22-slim

RUN apt-get update \
  && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/flexi.db
ENV PORT=3000

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate && npm start"]
