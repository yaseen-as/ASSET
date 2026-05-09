{{/*
Wait-for-postgres init container — included in every backend Deployment.
Blocks until postgres-service in the database namespace accepts TCP connections.
*/}}
{{- define "swingtrader.waitForPostgres" -}}
- name: wait-for-postgres
  image: busybox:1.36
  command:
    - sh
    - -c
    - |
      echo "Waiting for PostgreSQL..."
      until nc -z postgres-service.database.svc.cluster.local 5432; do
        echo "postgres not ready — retrying in 2s"
        sleep 2
      done
      echo "PostgreSQL is ready."
{{- end }}

{{/*
Hot-reload hostPath volume definition (source-code).
*/}}
{{- define "swingtrader.hotReloadVolume" -}}
- name: source-code
  hostPath:
    path: {{ .Values.hotReload.hostPath }}
    type: Directory
{{- end }}

{{/*
Hot-reload volume mount — mounts the monorepo root at /app inside the container.
*/}}
{{- define "swingtrader.hotReloadVolumeMount" -}}
- name: source-code
  mountPath: /app
{{- end }}
