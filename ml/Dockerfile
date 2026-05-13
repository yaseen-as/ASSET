FROM python:3.11-slim

WORKDIR /ml

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY pipelines ./pipelines

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

ENTRYPOINT ["python", "-m"]
CMD ["pipelines.technical.train"]
