#!/usr/bin/env bash
set -e

IMAGE_NAME=orgcontrib-app
TAG=deploy
OUTPUT_TAR=${IMAGE_NAME}-${TAG}.tar

echo "👉 初始化 buildx（如已存在则忽略）"
docker buildx inspect orgcontrib-builder >/dev/null 2>&1 || \
  docker buildx create --name orgcontrib-builder --use

docker buildx inspect --bootstrap

echo "👉 构建 linux/amd64 镜像：${IMAGE_NAME}:${TAG}"
docker buildx build \
  --platform linux/amd64 \
  -t ${IMAGE_NAME}:${TAG} \
  -f Dockerfile \
  --load .

echo "👉 导出镜像为 TAR：${OUTPUT_TAR}"
docker save -o ${OUTPUT_TAR} ${IMAGE_NAME}:${TAG}

echo
echo "🎉 完成"
echo "生成文件：${OUTPUT_TAR}"
echo "可在 Ubuntu 上使用：docker load -i ${OUTPUT_TAR}"