import * as awsx from "@pulumi/awsx";
import * as cloudflare from '@pulumi/cloudflare'
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

const dockerAuth = Buffer.from(process.env.DOCKER_USERNAME + ":" + process.env.DOCKER_PASSWORD).toString('base64')
const dockerAuthDomain = process.env.DOCKER_AUTH_DOMAIN || "ghcr.io"

const hostname = subdomain ? subdomain + "." + domain : domain;
const isMinikube = platformType === platformTypes.minikube

const provider = (() => {
  switch (platformType) {
    case platformTypes.minikube:
      return new k8s.Provider(clusterName);
    case platformTypes.aws:
      // Create a VPC for our cluster due to https://github.com/pulumi/pulumi-eks/issues/95
      const vpc = new awsx.ec2.Vpc("vpc", {
        numberOfAvailabilityZones: 2
      });
      // careful when changing this after deploy: https://github.com/pulumi/pulumi-eks/issues/178 
      return new eks.Cluster(clusterName, {
        desiredCapacity: 2,
        instanceType: "t3.small", 
        maxSize: 2,
        minSize: 1,
        nodeAssociatePublicIpAddress: false,
        privateSubnetIds: vpc.privateSubnetIds,
        publicSubnetIds: vpc.publicSubnetIds,
        vpcId: vpc.id,
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
const imagePullSecrets = new k8s.core.v1.Secret(
      "docker",
      {
        metadata: {
          name: "docker-secret",
        },
        type: "kubernetes.io/dockerconfigjson",
        stringData: {
          ".dockerconfigjson": `{"auths":{"${dockerAuthDomain}":{"auth":"${dockerAuth}"}}}`,
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
  imagePullPolicy: "Always",
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
export const appHostname = nginxSrv.status.loadBalancer.ingress[0].hostname;

// 
// DNS
//
if (!isMinikube) {
  if (domain === 'localhost') throw new Error('Domain should not be localhost')
  const cloudflareZone = cloudflare.getZones({
    filter: {
        name: domain,
    }
  })

  const site = new cloudflare.Record(
    hostname,
    {
      zoneId: cloudflareZone.then(z => {
          return z.zones[0].id!
      }),
      name: subdomain,
      value: appHostname,
      type: "CNAME",
      proxied: true
  }
);
}
