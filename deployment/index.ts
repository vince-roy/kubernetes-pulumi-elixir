import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { deploymentElixir } from './recipes/deploymentElixir'
import { helmPostgres } from "./recipes/helmPostgres";
import { ingressApp } from "./recipes/ingressApp";
import { certManagerWithCloudflare } from "./recipes/certManagerWithCloudflare";
import { ingressNginx } from "./recipes/ingressNginx";

enum platformTypes {
  aws = "aws",
  minikube = "minikube"
}

const appConfig = new pulumi.Config();
const appReplicaCount = parseInt(appConfig.get("appReplicaCount") || "1");
const cloudflareConfig = new pulumi.Config("cloudflare");
const clusterName = "demo-k8s"
const domain = process.env.DOMAIN || appConfig.get("domain") || "localhost";
const platformType : platformTypes = appConfig.require("platformType")
const mainAppImageName = process.env.DOCKER_IMAGE_NAME || appConfig.get('dockerImageName');
const passwordPostgres = appConfig.requireSecret("passwordPostgres");
const passwordRedis = appConfig.requireSecret("passwordRedis");
const postgresDatabaseName = appConfig.require("postgresDatabaseName");
const appSecretKeyBase = appConfig.requireSecret("appSecretKeyBase");
const subdomain = process.env.SUBDOMAIN || appConfig.get("subdomain") || "";

const hostname = subdomain ? subdomain + "." + domain : domain;
const isMinikube = platformType !== platformTypes.minikube

const provider = (() => {
  switch (platformType) {
    case platformTypes.minikube:
      return new k8s.Provider(clusterName);
    case platformTypes.aws:
      return new eks.Cluster(clusterName, {
        instanceType: "t2.medium",
        desiredCapacity: 2,
        minSize: 1,
        maxSize: 2,
      }).provider;
    default: 
      throw new Error("Unknown Platform Type")
  }
})()



const tlsSecretName = "tls-cert";

if (!mainAppImageName) {
  throw new Error("please provide a Docker image name for the main app");
}

//
// CERT MANAGEMENT
//
if (!isMinikube) {
  const cloudflareApiToken = cloudflareConfig.require("apiToken");
  certManagerWithCloudflare({
    cloudflareApiToken,
    name: 'cert-manager',
    provider
  })
}

let passwordDbEncoded = pulumi
  .all([passwordPostgres])
  .apply(([passwordDb]) => encodeURIComponent(passwordDb));
let passwordRedisEncoded = pulumi
  .all([passwordRedis])
  .apply(([passwordRedis]) => encodeURIComponent(passwordRedis));

//
// Postgres
//
helmPostgres({
  password: passwordPostgres,
  provider
})

//
// Redis (Coming soon...)
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

const appSecrets = new k8s.core.v1.Secret(
  "app-secrets",
  {
    metadata: {
      name: "app-secrets",
    },
    stringData: {
      DATABASE_URL: pulumi.interpolate`ecto://postgres:${passwordDbEncoded}@postgresql-hl/${postgresDatabaseName}`,
      REDIS_URL: pulumi.interpolate`redis://:${passwordRedisEncoded}@redis-master`,
      SECRET_KEY_BASE: appSecretKeyBase,
    },
    type: "opaque",
  },
  {
    provider,
  }
);

const app = deploymentElixir({
  dockerImage: mainAppImageName,
  imagePullPolicy: platformType !== platformTypes.minikube ? "Never" : "Always",
  name: 'main-app',
  provider: provider,
  replicaCount: appReplicaCount,
  secretsAppName: appSecrets.metadata.name,
  secretsImagePullName: imagePullSecrets?.metadata?.name
})

const appServiceName = "service-app"
const appService = new k8s.core.v1.Service(
  appServiceName,
  {
    metadata: {
      name: appServiceName,
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

//
// Ingress
//
const nginxName = "ingress-nginx";
const nginxIngressRelease = ingressNginx({
  disableAdmissionWebhooks: isMinikube,
  name: nginxName,
  provider
})

ingressApp({
  hostname,
  name: "app-ingress",
  port: 4000,
  provider,
  serviceName: appService.metadata.name,
  secretTlsName: tlsSecretName,
  useCertManager: !isMinikube
})

const nginxSrv = k8s.core.v1.Service.get(
  nginxName,
  pulumi.interpolate`${nginxIngressRelease.status.namespace}/${nginxIngressRelease.status.name}-controller`
);
export const appIp = nginxSrv.status.loadBalancer.ingress[0].ip;


// 
// DNS
//
