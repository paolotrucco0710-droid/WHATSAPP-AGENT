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

# Railway inietta PORT=8080 a runtime — EXPOSE aiuta il routing del dominio pubblico
EXPOSE 8080

CMD ["npm", "run", "railway:start"]
