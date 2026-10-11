# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- worker (ingestao da Pluggy) ----
# docker build --target worker -t finance-worker:1 .
FROM node:20-alpine AS worker-build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:worker

FROM node:20-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=worker-build /app/dist/worker.js /app/dist/equivalencia.js ./
# D2: resvg e nativo (binario musl) e fica fora do bundle; a fonte do grafico vem do pacote dejavu
COPY --from=worker-build /app/node_modules/@resvg ./node_modules/@resvg
COPY --from=worker-build /app/node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf /app/node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf ./fonts/
USER node
CMD ["node", "worker.js"]

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
