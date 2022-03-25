import * as k8s from "@pulumi/kubernetes";
import { Output, ProviderResource } from "@pulumi/pulumi";

type ArgsHelmPostgres = {
    password: Output<string>,
    provider: ProviderResource
}

export const helmPostgres = (args: ArgsHelmPostgres) => {
    return new k8s.helm.v3.Chart(
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
                  postgresPassword: args.password,
                },
              },
            },
            "image.tag": "14.2.0",
          },
        },
        { provider: args.provider }
      );
}