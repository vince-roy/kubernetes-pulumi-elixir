#
# Earthfile to deploy an app using Pulumi and a Docker Image.
# Used to deploy in CI environments like Github Actions
#

deploy:
  FROM node:14.16.0-alpine3.13
  RUN apk update && \
    apk add --no-cache curl libc6-compat
  ENV PATH=$PATH:/root/.pulumi/bin
  ARG PULUMI_STACK
  ARG DOCKER_IMAGE_NAME
  COPY package* .
  RUN curl -fsSL https://get.pulumi.com | sh
  RUN npm install
  COPY --dir deployment /
  WORKDIR /deployment
  RUN --secret PULUMI_ACCESS_TOKEN=+secrets/PULUMI_TOKEN pulumi login --non-interactive
  RUN pulumi stack select $PULUMI_STACK
  RUN pulumi config set appImage $DOCKER_IMAGE_NAME
  # DOCKER_AUTH_BASE64 is a string consisting of username:password using base64 encoding
  RUN --secret DOCKER_AUTH_BASE64=+secrets/DOCKER_AUTH_BASE64 pulumi up --yes --non-interactive 