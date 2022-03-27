import * as k8s from "@pulumi/kubernetes";
import { Output, ProviderResource } from "@pulumi/pulumi";

type AppArguments = {
    dockerImage: string,
    imagePullPolicy: "Never" | "Always"
    name: string,
    provider: ProviderResource
    replicaCount: number,
    secretsAppName: Output<string>,
    secretsImagePullName?: Output<string> | null
}

export const deploymentElixir = (args: AppArguments) => {
    const labels = {app: args.name}

    return  new k8s.apps.v1.Deployment(
    args.name,
    {
      spec: {
        selector: { matchLabels: labels },
        replicas: args.replicaCount,
        template: {
          metadata: {
            labels: labels,
          },
          spec: {
            containers: [
              {
                name: args.name,
                image: args.dockerImage,
                imagePullPolicy: args.imagePullPolicy,
                envFrom: [
                  {
                    secretRef: {
                      name: args.secretsAppName,
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
            imagePullSecrets: args.secretsImagePullName
              ? [
                  {
                    name: args.secretsImagePullName!
                  },
                ]
              : []
          },
        },
      },
    },
    { provider: args.provider }
  )
}