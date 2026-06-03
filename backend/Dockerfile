# Use specialized lightweight Python base image
FROM python:3.11-slim

# Install system utilities and FFmpeg for media conversions
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Expose python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source resources
COPY . .

EXPOSE 8000

# Fire FastAPI production daemon
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
