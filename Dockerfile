FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# FEATURE_INPUT=1 builds in the Input tab (EEG bridge, demo signals); the default build leaves it out
ARG FEATURE_INPUT=0
ENV VITE_FEATURE_INPUT=$FEATURE_INPUT
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
