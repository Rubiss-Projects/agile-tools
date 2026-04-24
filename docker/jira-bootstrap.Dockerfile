FROM node:24-alpine

RUN apk add --no-cache postgresql17-client

WORKDIR /bootstrap