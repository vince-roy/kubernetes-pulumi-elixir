import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const appNamespace = (s: string) => "demo-" + s;
const appConfig = new pulumi.Config();
const appReplicaCount = parseInt(appConfig.get("appReplicaCount") || "1");
const cloudflareConfig = new pulumi.Config("cloudflare");
const domain = process.env.DOMAIN || appConfig.get("domain") || "localhost";
const isMinikube = appConfig.requireBoolean("isMinikube");
const mainAppImageName = process.env.DOCKER_IMAGE_NAME || appConfig.get('dockerImageName');
const passwordPostgres = appConfig.requireSecret("passwordPostgres");
const passwordRedis = appConfig.requireSecret("passwordRedis");
const postgresDatabaseName = appConfig.require("postgresDatabaseName");
const appSecretKeyBase = appConfig.requireSecret("appSecretKeyBase");
const subdomain = process.env.SUBDOMAIN || appConfig.get("subdomain") || "";

const hostname = subdomain ? subdomain + "." + domain : domain;
const provider = new k8s.Provider(appNamespace("k8s"));
const tlsSecretName = appNamespace("tls-cert");

if (!mainAppImageName) {
  throw new Error("please provide a Docker image name for the main app");
}

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

let passwordDbEncoded = pulumi
  .all([passwordPostgres])
  .apply(([passwordDb]) => encodeURIComponent(passwordDb));
let passwordRedisEncoded = pulumi
  .all([passwordRedis])
  .apply(([passwordRedis]) => encodeURIComponent(passwordRedis));
const dbSecrets = new k8s.core.v1.Secret(
  "db-secrets",
  {
    metadata: {
      name: "db-secrets",
    },
    stringData: {
      "redis-password": passwordRedisEncoded,
      "postgres-password": passwordPostgres,
      "postgresql-password": passwordPostgres,
      "replication-password": passwordPostgres,
      "ldap-password": passwordPostgres,
      DATABASE_URL: pulumi.interpolate`ecto://postgres:${passwordDbEncoded}@postgresql-hl/${postgresDatabaseName}`,
      REDIS_URL: pulumi.interpolate`redis://:${passwordRedisEncoded}@redis-master`,
    },
    type: "opaque",
  },
  {
    provider,
  }
);

//
// Postgres
//
const postgres = new k8s.helm.v3.Chart(
  "postgresql",
  {
    chart: "postgresql",
    fetchOpts: {
      repo: "https://charts.bitnami.com/bitnami",
    },
    version: "11.1.9",
    // https://github.com/bitnami/charts/blob/master/bitnami/postgresql/values.yaml
    values: {
      /** @param auth.existingSecret Name of existing secret to use for PostgreSQL credentials
      ## `auth.postgresPassword`, `auth.password`, and `auth.replicationPassword` will be ignored and picked up from this secret
      ## The secret must contain the keys `postgres-password` (which is the password for "postgres" admin user),
      ## `password` (which is the password for the custom user to create when `auth.username` is set),
      ## and `replication-password` (which is the password for replication user).
      ## The secret might also contains the key `ldap-password` if LDAP is enabled. `ldap.bind_password` will be ignored and
      ## picked from this secret in this case.
      ## The value is evaluated as a template.
      **/
      // "auth.existingSecret": dbSecrets.metadata.name,
      global: {
        postgresql: {
          auth: {
            postgresPassword: passwordPostgres,
          },
        },
      },
      "image.tag": "14.2.0",
    },
  },
  { provider }
);

//
// Redis
//

//
// App
//
const imagePullSecrets = isMinikube
  ? null
  : new k8s.core.v1.Secret(
      "ghcr",
      {
        metadata: {
          name: "ghcr-secret",
        },
        type: "kubernetes.io/dockerconfigjson",
        stringData: {
          ".dockerconfigjson": `{"auths":{"https://ghcr.io":{"auth":"${process.env.DOCKER_AUTH_BASE64}"}}}`,
        },
      },
      {
        provider,
      }
    );
const appLabels = { app: "main-app" };
const appSecrets = new k8s.core.v1.Secret(
  "app-secrets",
  {
    metadata: {
      name: "app-secrets",
    },
    stringData: {
      SECRET_KEY_BASE: appSecretKeyBase,
    },
    type: "opaque",
  },
  {
    provider,
  }
);
const app = new k8s.apps.v1.Deployment(
  appNamespace("main-app"),
  {
    spec: {
      selector: { matchLabels: appLabels },
      replicas: appReplicaCount,
      template: {
        metadata: {
          annotations: isMinikube
            ? {
                "pulumi.com/skipAwait": "true",
              }
            : {},
          labels: appLabels,
        },
        spec: {
          containers: [
            {
              name: appLabels.app,
              image: mainAppImageName,
              imagePullPolicy: isMinikube ? "Never" : "Always",
              envFrom: [
                {
                  secretRef: {
                    name: appSecrets.metadata.name,
                    optional: false,
                  },
                },
                {
                  secretRef: {
                    name: dbSecrets.metadata.name,
                    optional: false,
                  },
                },
              ],
              livenessProbe: {
                httpGet: {
                  path: "/_k8s/liveness",
                  port: 4000,
                },
                periodSeconds: 10,
                failureThreshold: 10,
              },
              ports: [
                {
                  name: "http",
                  containerPort: 4000,
                  protocol: "TCP",
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: "/_k8s/readiness",
                  port: 4000,
                },
                periodSeconds: 10,
                failureThreshold: 3,
              },
              startupProbe: {
                httpGet: {
                  path: "/_k8s/startup",
                  port: 4000,
                },
                periodSeconds: 10,
                failureThreshold: 15,
              },
            },
          ],
          imagePullSecrets: isMinikube
            ? []
            : [
                {
                  name: imagePullSecrets!.metadata.name,
                },
              ],
        },
      },
    },
  },
  { provider }
);
const appService = new k8s.core.v1.Service(
  appNamespace("service"),
  {
    metadata: {
      name: "app-service",
    },
    spec: {
      type: "ClusterIP",
      selector: app.spec.template.metadata.labels,
      ports: [
        {
          port: 4000,
          targetPort: 4000,
        },
      ],
    },
  },
  { provider }
);

// Ingress
//
// Deploy the NGINX ingress controller using the Helm chart.
// Create Kubernetes namespaces.
const nginxName = "ingress-nginx";
const nginxIngressRelease = new k8s.helm.v3.Release(
  nginxName,
  {
    chart: nginxName,
    createNamespace: true,
    repositoryOpts: {
      repo: "https://kubernetes.github.io/ingress-nginx",
    },
    // namespace: nginxNamespace.metadata.name,
    values: {
      controller: {
        admissionWebhooks: {
          enabled: !isMinikube // disable in Minikube due to: https://github.com/kubernetes/ingress-nginx/issues/5968#issuecomment-700287
        },
        config: {
          "use-forwarded-headers": true,
        },
        publishService: { enabled: true },
      },
    },
  },
  { provider }
);

const appIngress = new k8s.networking.v1.Ingress(
  appNamespace("ingress"),
  {
    kind: "Ingress",
    metadata: {
      annotations: {
        // add an annotation indicating the issuer to use.
        "kubernetes.io/ingress.class": "nginx",
        "nginx.ingress.kubernetes.io/proxy-body-size": "50m",
        ...(isMinikube
          ? {}
          : { "cert-manager.io/cluster-issuer": "letsencrypt-prod" }),
      },
    },
    spec: {
      rules: [
        {
          host: hostname,
          http: {
            paths: [
              {
                backend: {
                  service: {
                    name: appService.metadata.name,
                    port: {
                      number: 4000,
                    },
                  },
                },
                path: "/",
                pathType: "Prefix",
              },
            ],
          },
        },
      ],
      tls: isMinikube
        ? []
        : [
            {
              hosts: [hostname],
              secretName: tlsSecretName,
            },
          ], // < placing a host in the TLS config will indicate a certificate should be created
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

// //
// DNS
//
