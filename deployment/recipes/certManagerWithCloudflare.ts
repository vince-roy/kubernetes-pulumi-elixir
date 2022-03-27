import * as k8s from "@pulumi/kubernetes";
import { Output, ProviderResource } from "@pulumi/pulumi";
import path = require("path");

type ArgsCertManagerWithCloudflare = {
    cloudflareApiToken: string,
    name: string,
    provider: ProviderResource
}

export const certManagerWithCloudflare = (args: ArgsCertManagerWithCloudflare) => {
    const certManager = new k8s.yaml.ConfigFile(
        args.name,
        {
          file: "https://github.com/jetstack/cert-manager/releases/download/v1.2.0/cert-manager.yaml",
        },
        { provider: args.provider }
      );
    
      const dnsSecret = new k8s.core.v1.Secret(
        "cloudflare-api-token-secret",
        {
          metadata: {
            name: "cloudflare-api-token-secret",
            namespace: args.name,
          },
          stringData: {
            apiToken: args.cloudflareApiToken,
          },
          type: "opaque",
        },
        {
          provider: args.provider
        }
      );
    
      // name: letsencrypt-prod
      const certManagerIssuer = new k8s.yaml.ConfigFile(
        "issuer- " + args.name,
        {
          file: path.resolve(__dirname, "./certIssuer.yaml"),
        },
        { provider: args.provider, dependsOn: certManager }
      );
}