# Backend container for Cost-Sacolas
# Builds a lightweight image with gunicorn serving the Flask app

FROM python:3.11-slim

# Prevents Python from writing .pyc files and enables unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps (add others here if Supabase client ever needs them)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Expose gunicorn port
EXPOSE 8000

# Gunicorn command
CMD ["gunicorn", "-b", "0.0.0.0:8000", "--workers", "4", "--threads", "2", "--timeout", "30", "app.main:app"]
