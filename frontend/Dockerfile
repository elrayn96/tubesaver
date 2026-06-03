# Stage 1: Build the Vite production bundle
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve compiled file nodes with Nginx
FROM nginx:alpine

# Copy static dist outputs to Nginx default folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy specialized custom Nginx route proxies configuration if needed (defers to port 80)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
