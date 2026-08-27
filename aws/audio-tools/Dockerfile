FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    MODEL_ROOT=/models \
    HF_HOME=/models/hf \
    TORCH_HOME=/models/torch \
    XDG_CACHE_HOME=/models/cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY aws/audio-tools/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY aws/audio-tools/worker/ /app/
RUN mkdir -p /models

CMD ["python", "worker.py"]
