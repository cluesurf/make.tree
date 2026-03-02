FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    clang \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

CMD ["bash", "-c", "\
  mkdir -p /out && \
  clang -O2 -c lib.c -o /out/hvm.o \
    -DHEAP_CAP_BITS=${HEAP_CAP_BITS:-38} \
    -DMAX_THREADS=${MAX_THREADS:-64} && \
  ar rcs /out/libhvm.a /out/hvm.o && \
  rm /out/hvm.o && \
  echo 'Linux: /out/libhvm.a'"]
