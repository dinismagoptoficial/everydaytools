FROM everyday-tools:local
USER 0
RUN apt-get update && apt-get install -y --no-install-recommends strace bash && rm -rf /var/lib/apt/lists/*
COPY requirements-dev.txt /tmp/requirements-dev.txt
RUN pip install --no-cache-dir -r /tmp/requirements-dev.txt pip-audit
