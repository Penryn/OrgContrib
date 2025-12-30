#!/usr/bin/env bash
set -e

WEB_IMAGE_NAME=orgcontrib-web
WORKER_IMAGE_NAME=orgcontrib-worker
MIGRATE_IMAGE_NAME=orgcontrib-migrate
TAG=deploy

WEB_TAR=${WEB_IMAGE_NAME}-${TAG}.tar
WORKER_TAR=${WORKER_IMAGE_NAME}-${TAG}.tar
MIGRATE_TAR=${MIGRATE_IMAGE_NAME}-${TAG}.tar

echo "👉 初始化 buildx（如已存在则忽略）"
docker buildx inspect orgcontrib-builder >/dev/null 2>&1 || \
  docker buildx create --name orgcontrib-builder --use

docker buildx inspect --bootstrap

echo "👉 构建 linux/amd64 镜像（web）：${WEB_IMAGE_NAME}:${TAG}"
docker buildx build \
  --platform linux/amd64 \
  -t ${WEB_IMAGE_NAME}:${TAG} \
  -f Dockerfile \
  --target web \
  --load .

echo "👉 构建 linux/amd64 镜像（worker）：${WORKER_IMAGE_NAME}:${TAG}"
docker buildx build \
  --platform linux/amd64 \
  -t ${WORKER_IMAGE_NAME}:${TAG} \
  -f Dockerfile \
  --target worker \
  --load .

echo "👉 构建 linux/amd64 镜像（migrate）：${MIGRATE_IMAGE_NAME}:${TAG}"
docker buildx build \
  --platform linux/amd64 \
  -t ${MIGRATE_IMAGE_NAME}:${TAG} \
  -f Dockerfile \
  --target migrate \
  --load .

echo "👉 导出镜像为 TAR：${WEB_TAR}"
docker save -o ${WEB_TAR} ${WEB_IMAGE_NAME}:${TAG}

echo "👉 导出镜像为 TAR：${WORKER_TAR}"
docker save -o ${WORKER_TAR} ${WORKER_IMAGE_NAME}:${TAG}

echo "👉 导出镜像为 TAR：${MIGRATE_TAR}"
docker save -o ${MIGRATE_TAR} ${MIGRATE_IMAGE_NAME}:${TAG}

echo
echo "🎉 完成"
echo "生成文件：${WEB_TAR} / ${WORKER_TAR} / ${MIGRATE_TAR}"
echo "可在 Ubuntu 上使用：docker load -i <tar>"