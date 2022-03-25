import * as k8s from "@pulumi/kubernetes";
import { Output, ProviderResource } from "@pulumi/pulumi";

type ArgsIngressApp = {
    hostname: string,
    name: string,
    port: number,
    provider: ProviderResource,
    serviceName: Output<string>,
    secretTlsName: string,
    useCertManager: boolean,
}

export const ingressApp = (args: ArgsIngressApp) => {
    return new k8s.networking.v1.Ingress(
      args.name,
    {
      kind: "Ingress",
      metadata: {
        annotations: {
          // add an annotation indicating the issuer to use.
          "kubernetes.io/ingress.class": "nginx",
          "nginx.ingress.kubernetes.io/proxy-body-size": "50m",
          ...(args.useCertManager
            ? {}
            : { "cert-manager.io/cluster-issuer": "letsencrypt-prod" }),
        },
      },
      spec: {
        rules: [
          {
            host: args.hostname,
            http: {
              paths: [
                {
                  backend: {
                    service: {
                      name: args.serviceName,
                      port: {
                        number: args.port
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
        tls: args.useCertManager
          ? []
          : [
              {
                hosts: [args.hostname],
                secretName: args.secretTlsName,
              },
            ], // < placing a host in the TLS config will indicate a certificate should be created
      },
    },
    { provider: args.provider }
  );
}