FROM python:3.14.7-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt requirements.lock ./
# CPU by default on both ARM64 and x86-64; select an official CUDA index for GPU builds.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir torch==2.14.0 -c requirements.lock --index-url "${TORCH_INDEX_URL}" \
    && pip install --no-cache-dir -r requirements.txt -c requirements.lock \
    && pip check

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
