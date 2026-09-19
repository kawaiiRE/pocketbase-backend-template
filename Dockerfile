FROM alpine:3.23 AS download

ARG PB_VERSION=0.40.4
ARG PB_SHA256=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa

RUN apk add --no-cache ca-certificates wget unzip \
  && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pocketbase.zip \
  && echo "${PB_SHA256}  /tmp/pocketbase.zip" | sha256sum -c - \
  && unzip /tmp/pocketbase.zip pocketbase -d /usr/local/bin

FROM alpine:3.23

RUN apk add --no-cache ca-certificates tzdata \
  && addgroup -g 1000 pocketbase \
  && adduser -D -u 1000 -G pocketbase pocketbase

COPY --from=download /usr/local/bin/pocketbase /usr/local/bin/pocketbase

WORKDIR /pb
COPY --chown=pocketbase:pocketbase pb_hooks ./pb_hooks
COPY --chown=pocketbase:pocketbase pb_migrations ./pb_migrations
RUN mkdir /pb/pb_data && chown pocketbase:pocketbase /pb/pb_data

USER pocketbase
ENV GOMEMLIMIT=160MiB
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8080", "--dir=/pb/pb_data", "--hooksDir=/pb/pb_hooks", "--migrationsDir=/pb/pb_migrations", "--automigrate=false", "--encryptionEnv=PB_ENCRYPTION_KEY"]
