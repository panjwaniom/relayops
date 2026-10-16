FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["sh", "-c", "node dist/seed.js; node dist/index.js"]
