#
# Earthfile to deploy an app using Pulumi and a Docker Image.
# Used to deploy in CI environments like Github Actions
#

deploy:
  FROM node:14.16.0-alpine3.13
  ARG PLATFORM_TYPE
  RUN apk update && \
    apk add --no-cache curl libc6-compat unzip
  IF [ "$PLATFORM_TYPE" = "aws" ]
    RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    RUN unzip awscliv2.zip
  END
  RUN ./aws/install
  ENV PATH=$PATH:/root/.pulumi/bin
  ARG PULUMI_STACK
  ARG DOCKER_IMAGE_NAME
  ARG SUBDOMAIN
  COPY package* .
  RUN curl -fsSL https://get.pulumi.com | sh
  RUN npm install
  COPY --dir deployment /
  WORKDIR /deployment
  RUN --secret PULUMI_ACCESS_TOKEN=+secrets/PULUMI_TOKEN pulumi login --non-interactive
  RUN pulumi stack select $PULUMI_STACK --create
  RUN --secret DOCKER_USERNAME=+secrets/DOCKER_USERNAME DOCKER_PASSWORD=+secrets/DOCKER_PASSWORD DOCKER_IMAGE_NAME=$DOCKER_IMAGE_NAME pulumi up --yes --non-interactive