FROM python:3.12-slim

WORKDIR /app

# Install system-level dependencies first
RUN apt-get update && apt-get install -y \
    libgstreamer1.0-0 \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly && \
    rm -rf /var/lib/apt/lists/*

# Copy only requirements first to leverage caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . /app

EXPOSE 8000
# Runs the FastAPI application for production
CMD ["fastapi", "run", "websocket.py"]