import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const appNamespace = (s: string) => "demo-" + s;
const config = new pulumi.Config();
const cloudflareConfig = new pulumi.Config("cloudflare");
const isMinikube = config.requireBoolean("isMinikube");

// Postgres
// Redis
const provider = new k8s.Provider(appNamespace("k8s"));

//
// CERT MANAGEMENT
//
if (!isMinikube) {
  const cloudflareApiToken = cloudflareConfig.require("apiToken");
  const certManagerNamespace = "cert-manager";
  const certManager = new k8s.yaml.ConfigFile(
    appNamespace("cert-manager"),
    {
      file: "https://github.com/jetstack/cert-manager/releases/download/v1.2.0/cert-manager.yaml",
    },
    { provider }
  );

  const dnsSecret = new k8s.core.v1.Secret(
    "cloudflare-api-token-secret",
    {
      metadata: {
        name: "cloudflare-api-token-secret",
        namespace: certManagerNamespace,
      },
      stringData: {
        apiToken: cloudflareApiToken,
      },
      type: "opaque",
    },
    {
      provider,
    }
  );

  // name: letsencrypt-prod
  const certManagerIssuer = new k8s.yaml.ConfigFile(
    appNamespace("cert-issuer"),
    {
      file: "certIssuer.yaml",
    },
    { provider, dependsOn: certManager }
  );
}

//
// Postgres
//


//
// Redis
//

//
// App
//

//
// Ingress
//
// Deploy the NGINX ingress controller using the Helm chart.
// Create Kubernetes namespaces.
const nginxName = "ingress-nginx";
const nginxNamespace = new k8s.core.v1.Namespace(
  nginxName,
  { metadata: { name: nginxName } },
  { provider }
);
const nginxIngressRelease = new k8s.helm.v3.Release(
  nginxName,
  {
    chart: nginxName,
    repositoryOpts: {
      repo: "https://kubernetes.github.io/ingress-nginx",
    },
    namespace: nginxNamespace.metadata.name,
    values: {
      controller: {
        config: {
          "use-forwarded-headers": true,
        },
        publishService: { enabled: true },
      },
    },
  },
  { provider }
);

const nginxSrv = k8s.core.v1.Service.get(
  nginxName,
  pulumi.interpolate`${nginxIngressRelease.status.namespace}/${nginxIngressRelease.status.name}-controller`
);
export const appIp = nginxSrv.status.loadBalancer.ingress[0].ip;

// export const appIp = nginxIngress.getResourceProperty('v1/Service', nginxName, 'ingress-nginx-controller', 'status')
//     .apply(status => {
//         return status.loadBalancer.ingress[0].ip
//     });


//
// DNS
//