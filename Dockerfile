FROM oven/bun:1
WORKDIR /app

COPY package.json bun.lock* ./
COPY prisma ./prisma
RUN bun install

COPY . .
ENV DATABASE_URL="file:/data/dev.db"
RUN bunx prisma generate && bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
