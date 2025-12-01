FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      git \
      curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
