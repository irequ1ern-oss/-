FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:account
FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt && useradd -u 10001 -m requiem && mkdir var && chown requiem var
COPY server server
COPY data data
COPY --from=frontend /app/dist dist
ENV PYTHONDONTWRITEBYTECODE=1 REQUIEM_DB=/app/var/requiem.sqlite3
EXPOSE 8080
CMD ["python","-m","server.start"]
