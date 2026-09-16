FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY local_lyric_optimizer/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY local_lyric_optimizer/ ./local_lyric_optimizer/

# App Runner expects the app to listen on port 8080
ENV LYRIC_SERVICE_PORT=8080
ENV LYRIC_SERVICE_HOST=0.0.0.0

EXPOSE 8080

CMD ["uvicorn", "local_lyric_optimizer.app:app", "--host", "0.0.0.0", "--port", "8080"]
