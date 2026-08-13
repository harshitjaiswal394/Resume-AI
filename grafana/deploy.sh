#!/usr/bin/env bash
# =============================================================================
# Resume-AI Grafana provisioning deploy script (kube-prometheus-stack)
# -----------------------------------------------------------------------------
# Creates the ConfigMaps the Grafana sidecars watch, then applies the
# values-overlay via helm so Grafana picks up:
#   - dashboards  (label grafana_dashboard,  JSON files)
#   - datasource  (label grafana_datasource, datasources.yaml)
#   - alerting    (mounted into /etc/grafana/provisioning/alerting)
#
# Prereqs: kubectl + helm authenticated to the cluster, release `prometheus`
#          installed in namespace `monitoring`.
# =============================================================================
set -euo pipefail

NS="${NS:-monitoring}"
RELEASE="${RELEASE:-prometheus}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Deploying Resume-AI Grafana provisioning to release '${RELEASE}' in '${NS}'"

# 1. Alerting bundle -> ConfigMap
#    Deploys the single-file alerting.yaml + template (the bundle under test).
#    The team-based split lives in grafana/alerting/team-based/ and is NOT
#    mounted here; switch to it once the single-file setup is verified.
#    --from-file=key=path keeps the `templates/` prefix so Grafana's
#    templateFiles.file: templates/resumatch_email.tmpl resolves correctly.
kubectl -n "$NS" create configmap grafana-resumatch-alerting \
  --from-file=alerting.yaml="${HERE}/alerting/alerting.yaml" \
  --from-file=templates/resumatch_email.tmpl="${HERE}/alerting/templates/resumatch_email.tmpl" \
  --dry-run=client -o yaml | kubectl -n "$NS" apply -f -
echo "==> Created grafana-resumatch-alerting"

# 2. Prometheus datasource -> ConfigMap tagged for the datasource sidecar
kubectl -n "$NS" create configmap grafana-resumatch-datasources \
  --from-file="${HERE}/datasources.yaml" \
  --labels="grafana_datasource=1" \
  --dry-run=client -o yaml | kubectl -n "$NS" apply -f -
echo "==> Created grafana-resumatch-datasources"

# 3. Dashboards -> one ConfigMap per dashboard, tagged for the dashboards sidecar
for f in backend-dashboard backend-dashboard-summary app-overview-dashboard; do
  kubectl -n "$NS" create configmap "grafana-${f}" \
    --from-file="${f}.json=${HERE}/${f}.json" \
    --labels="grafana_dashboard=1" \
    --dry-run=client -o yaml | kubectl -n "$NS" apply -f -
  echo "==> Created grafana-${f}"
done

# 4. Apply the values overlay (idempotent helm upgrade, preserves existing values)
helm upgrade "$RELEASE" prometheus-community/kube-prometheus-stack \
  -n "$NS" \
  -f "${HERE}/values-overlay.yaml" \
  --reuse-values

echo "==> Done. Grafana sidecars will load the new provisioning on the next sync (~60s)."
echo "    Verify: kubectl -n ${NS} rollout status deploy/prometheus-grafana"
