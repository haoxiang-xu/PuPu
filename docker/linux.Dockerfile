FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# Python 3.12 (ships with 24.04), Node.js 20 LTS, electron-builder Linux deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12 python3.12-venv python3.12-dev python3-pip \
    curl ca-certificates git \
    # electron-builder: AppImage + deb packaging
    libgtk-3-0t64 libnotify4 libnss3 libxss1 libxtst6 xauth xvfb \
    fakeroot dpkg binutils xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 LTS via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
