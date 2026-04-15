# Stage 1: Builder
FROM python:3.11-slim as builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a dedicated directory
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Final Production Image
FROM python:3.11-slim

# Copy only the installed packages from the builder stage
COPY --from=builder /install /usr/local

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PORT 8090

WORKDIR /app

# Install runtime system dependencies (only libpq for postgres)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Expose the requested port
EXPOSE 8090

# High-concurrency production command
# Using Gunicorn as manager and UvicornWorker for ASGI (FastAPI) compatibility
CMD ["gunicorn", "app.main:app", \
     "-b", "0.0.0.0:8090", \
     "-w", "2", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "--worker-connections", "1000", \
     "--timeout", "300", \
     "--log-level", "info"]
