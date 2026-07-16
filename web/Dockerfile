FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG NEXT_PUBLIC_BASE_PATH=
ARG NEXT_PUBLIC_METABASE_URL=http://analytics.localhost
ARG NEXT_PUBLIC_METABASE_DASHBOARD_ID=0
ARG NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/fiord
ARG NEXT_PUBLIC_REPOSITORY_URL=https://github.com/
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH \
    NEXT_PUBLIC_METABASE_URL=$NEXT_PUBLIC_METABASE_URL \
    NEXT_PUBLIC_METABASE_DASHBOARD_ID=$NEXT_PUBLIC_METABASE_DASHBOARD_ID \
    NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL \
    NEXT_PUBLIC_REPOSITORY_URL=$NEXT_PUBLIC_REPOSITORY_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.NEXT_PUBLIC_BASE_PATH||'')+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
