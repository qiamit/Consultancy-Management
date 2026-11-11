# Standards Library indexer (deploy/standards-library/indexer.py): poppler for text, tesseract for scanned pages.
# Runs on demand (compose profile "tools"), on the server and on Local Host alike.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "psycopg[binary]==3.2.3" "openpyxl==3.1.5"
COPY indexer.py /app/indexer.py
WORKDIR /app
ENTRYPOINT ["python3", "-u", "/app/indexer.py"]
