import * as k8s from "@pulumi/kubernetes";
import { ProviderResource } from "@pulumi/pulumi";
type ArgsIngressNginx = {
    disableAdmissionWebhooks: boolean // useful to disable in Minikube due to: https://github.com/kubernetes/ingress-nginx/issues/5968#issuecomment-700287
    name: string,
    provider: ProviderResource
}

export const ingressNginx = (args: ArgsIngressNginx) => {
    return new k8s.helm.v3.Release(
    args.name,
    {
      chart: args.name,
      createNamespace: true,
      repositoryOpts: {
        repo: "https://kubernetes.github.io/ingress-nginx",
      },
      values: {
        controller: {
          admissionWebhooks: {
            enabled: !args.disableAdmissionWebhooks // disable in Minikube due to: https://github.com/kubernetes/ingress-nginx/issues/5968#issuecomment-700287
          },
          config: {
            "use-forwarded-headers": true,
          },
          publishService: { enabled: true },
        },
      },
    },
    { provider: args.provider }
  );   
}