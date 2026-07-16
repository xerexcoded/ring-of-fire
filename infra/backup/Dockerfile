FROM postgres:17-alpine

RUN apk add --no-cache age tzdata
COPY backup-once /usr/local/bin/backup-once
COPY backup-loop /usr/local/bin/backup-loop
RUN chmod +x /usr/local/bin/backup-once /usr/local/bin/backup-loop

ENTRYPOINT ["/usr/local/bin/backup-loop"]

