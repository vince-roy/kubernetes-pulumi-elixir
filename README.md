# A Flexible Recipe for Deployment to Multiple Environments Using Pulumi, Kubernetes and Github Actions
The following is a recipe for managing and testing application deployments in different environments (local, staging, feature branch)

## Key Features
- Local deployment recipe
- AWS deployment recipe

## Prerequisites
- [AWS account](https://aws.amazon.com/account/)
- [Cloudflare account](https://www.cloudflare.com/en-ca/)
- [Github account](https://github.com)
- [Pulumi account](https://www.pulumi.com/)

## Tools
- [Certmanager](https://github.com/cert-manager/cert-manager) and [Let's Encrypt](https://letsencrypt.org/) to manage SSL certifications
- [Cloudflare](https://www.cloudflare.com/en-ca/) for domain management
- [Earthly](https://earthly.dev/) for reproducible builds
- [Elixir](https://elixir-lang.org/) and [Phoenix](https://www.phoenixframework.org/) for the demo application
- [Github Actions](https://github.com/features/actions) to trigger deployments on different branches
- [Nginx](https://www.nginx.com/) as the reverse proxy
- [Pulumi](https://www.pulumi.com/) for instrastructure as code
- [Postgres](https://www.postgresql.org/) as the database inside the Kubernetes cluster

## Comments/Questions
Please open an issue or a discussion or send me a message on [Twitter](https://twitter.com/vinnerroy).