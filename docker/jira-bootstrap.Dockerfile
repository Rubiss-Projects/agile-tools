FROM node:24-alpine

RUN apk add --no-cache postgresql18-client

WORKDIR /bootstrap
