FROM python:3.12-slim

# Install system dependencies (ffmpeg and Node.js for challenge solving)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 10000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "10000"]
