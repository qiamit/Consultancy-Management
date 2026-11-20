# Standards Library indexer (deploy/standards-library/indexer.py): poppler for text, tesseract for scanned pages,
# fastembed (ONNX, CPU) for the chunk embeddings. Runs on demand (compose profile "tools") on the server; the same
# image runs standards-embed (embed_server.py) for questions.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "psycopg[binary]==3.2.3" "openpyxl==3.1.5" "fastembed==0.7.3"
# The model is fetched once at build time, so runs and the embed service never download at start.
ENV FASTEMBED_CACHE_PATH=/models
RUN python3 -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"
COPY indexer.py embed_server.py /app/
WORKDIR /app
ENTRYPOINT ["python3", "-u", "/app/indexer.py"]
