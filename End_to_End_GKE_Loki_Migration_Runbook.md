# End-to-End GKE Loki Migration Runbook

> **Status:** Part 1 of a complete production runbook.

## Overview

This runbook documents the complete migration of a Loki logging stack on Google Kubernetes Engine (GKE) from an initial deployment with authentication and scheduling issues to a production-ready deployment using Google Cloud Storage (GCS) and GKE Workload Identity.

## Scope

This document will eventually cover:

1. Environment preparation
2. Initial Helm deployment
3. Loki architecture
4. GCS bucket configuration
5. IAM configuration
6. Initial failures
7. Root cause analysis
8. Investigation commands
9. Workload Identity migration
10. Node pool migration
11. Validation
12. Rollback
13. Production best practices
14. Complete command reference

## Target Architecture

```text
Application Pods
      │
      ▼
Container Logs
      │
      ▼
Promtail (DaemonSet)
      │
      ▼
Loki Gateway
      │
 ┌────┴────┐
 ▼         ▼
Read     Write
   \     /
    Backend
      │
      ▼
Google Cloud Storage
      │
      ▼
Grafana
```

## Prerequisites

- Google Cloud project
- GKE cluster
- kubectl configured
- Helm 3
- Google Cloud CLI
- GCS bucket for Loki
- Kubernetes namespace `monitoring`

## High-Level Migration Phases

| Phase | Goal |
|------|------|
| Assessment | Identify failures |
| Investigation | Collect evidence |
| Root Cause | Determine why the deployment failed |
| Remediation | Apply fixes |
| Migration | Move workloads to Workload Identity |
| Validation | Confirm healthy logging |
| Cleanup | Remove legacy infrastructure |

## Commands Used Frequently

### Check cluster nodes

```bash
kubectl get nodes -o wide
```

**Why:** Verify node health and placement.

### Check monitoring pods

```bash
kubectl get pods -n monitoring -o wide
```

**Why:** Verify Loki, Grafana, Promtail and Prometheus status.

### Check application pods

```bash
kubectl get pods -n resumatch-ai -o wide
```

**Why:** Confirm application workloads and node placement.

### Inspect logs

```bash
kubectl logs -n monitoring <pod-name>
```

**Why:** Identify startup errors, authentication failures, storage issues and ring formation problems.

---

## Next Part

Part 2 will cover:
- Helm deployment
- Storage configuration
- GCS bucket creation
- IAM setup
- Initial Helm values
- Why each configuration is required
- Verification commands


# Initial Deployment, GCS Configuration, Helm Installation & Verification

> Continue this file after Part 1.

---

# 1. Objectives

Build a production-ready logging platform using:

- GKE
- Helm
- Loki Distributed
- Promtail
- Grafana
- Google Cloud Storage (GCS)
- Persistent Volumes

---

# 2. Create Namespace

```bash
kubectl create namespace monitoring
```

### Why?

Creates an isolated namespace for the monitoring stack.

### Verify

```bash
kubectl get ns monitoring
```

Expected:

```
monitoring   Active
```

---

# 3. Create GCS Bucket

```bash
gcloud storage buckets create gs://resumatch-gke-loki-storage \
    --location=us-east1
```

### Why?

Loki stores log chunks, indexes and metadata in object storage.

### Verify

```bash
gcloud storage ls
```

Expected:

```
gs://resumatch-gke-loki-storage
```

---

# 4. Install Helm Repository

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
```

### Why?

Downloads the latest Helm chart metadata.

### Verify

```bash
helm search repo grafana/loki
```

---

# 5. Install Loki

Example:

```bash
helm install loki grafana/loki \
    -n monitoring \
    -f values.yaml
```

### Why?

Deploys:

- Gateway
- Read
- Write
- Backend
- Results Cache
- Chunks Cache

---

# 6. Install Promtail

```bash
helm install promtail grafana/promtail \
    -n monitoring
```

### Why?

Promtail runs as a DaemonSet and collects container logs from every node.

---

# 7. Install Grafana

```bash
helm install grafana grafana/grafana \
    -n monitoring
```

### Why?

Provides dashboards and LogQL queries.

---

# 8. Verify Helm Releases

```bash
helm list -n monitoring
```

Expected:

- loki
- promtail
- grafana

---

# 9. Verify Pods

```bash
kubectl get pods -n monitoring -o wide
```

Healthy deployment includes:

- loki-backend
- loki-read
- loki-write
- loki-gateway
- promtail
- grafana

---

# 10. Verify Persistent Volumes

```bash
kubectl get pvc -n monitoring
```

Why?

Ensures caches and stateful components have persistent storage.

---

# 11. Verify Services

```bash
kubectl get svc -n monitoring
```

Confirm:

- loki-gateway
- grafana

---

# 12. Common Problems During Initial Deployment

## Pods Pending

Check:

```bash
kubectl describe pod <pod> -n monitoring
```

Possible causes:

- Insufficient memory
- PVC not bound
- Missing StorageClass

---

## CrashLoopBackOff

Check:

```bash
kubectl logs <pod> -n monitoring
```

Reasons:

- Invalid Helm values
- Authentication failure
- Storage configuration

---

## Verification Checklist

- [ ] Namespace created
- [ ] Helm repositories configured
- [ ] Loki installed
- [ ] Promtail installed
- [ ] Grafana installed
- [ ] Pods Running
- [ ] PVC Bound
- [ ] Services Available

---

## Next Part

Part 3 covers:

- Loki Distributed Architecture
- Read / Write / Backend internals
- TSDB
- Chunk Storage
- GCS Layout
- Request Flow
- Promtail Pipeline
# End-to-End GKE Loki Migration Runbook - Part 3

# Loki Distributed Architecture Deep Dive

> Append this after Part 2.

---

# 1. Why Loki?

Loki is a horizontally scalable log aggregation system designed for Kubernetes.
Unlike Elasticsearch, Loki indexes labels instead of full log contents, making it more cost-effective.

---

# 2. End-to-End Logging Flow

```text
Application Pod
      │
stdout / stderr
      │
      ▼
Container Runtime Logs
      │
      ▼
Promtail (DaemonSet)
      │
      ▼
Loki Gateway
      │
 ┌────┴─────────────┐
 ▼                  ▼
Loki Write      Loki Read
      │              │
      └──────┬───────┘
             ▼
       Loki Backend
             │
             ▼
 Google Cloud Storage
             │
             ▼
         Grafana
```

---

# 3. Components

## Promtail

Runs as a DaemonSet on every node.

Responsibilities:
- Discover pods
- Read container log files
- Add Kubernetes labels
- Push logs to Loki Gateway

Verify:

```bash
kubectl get daemonset -n monitoring promtail
```

Why?
Ensures one Promtail pod exists per node.

---

## Loki Gateway

Acts as the entry point for reads and writes.

Verify:

```bash
kubectl get svc -n monitoring
```

Look for:

```
loki-gateway
```

---

## Loki Write

Responsibilities:

- Receive log batches
- Validate labels
- Compress chunks
- Write chunks to object storage
- Maintain WAL

Verify:

```bash
kubectl logs -n monitoring loki-write-0
```

Healthy output:
No storage errors or "empty ring" messages.

---

## Loki Read

Responsibilities:

- Execute LogQL queries
- Read indexes
- Retrieve chunks
- Return results to Grafana

Verify:

```bash
kubectl logs -n monitoring deploy/loki-read
```

---

## Loki Backend

Responsibilities:

- TSDB index management
- Compaction
- Retention
- Bucket synchronization

Verify:

```bash
kubectl logs -n monitoring loki-backend-0
```

Healthy indicators:

- table_manager
- compactor running
- no 403 AccessDenied

---

# 4. Storage Layout

Object storage contains:

```text
bucket/
 ├── chunks/
 ├── index/
 ├── wal/
 └── ruler/
```

Purpose:

- chunks → compressed log data
- index → metadata for queries
- wal → recovery after restart
- ruler → alert rules

Verify:

```bash
gcloud storage ls -r gs://resumatch-gke-loki-storage
```

Expected:
Continuous object creation while logs are ingested.

---

# 5. TSDB

Time Series Database indexes labels instead of complete log messages.

Benefits:

- Lower storage cost
- Faster searches
- Efficient compression

---

# 6. Grafana Query Flow

```text
Grafana
   │
   ▼
Loki Read
   │
Backend
   │
Index Lookup
   │
Chunk Retrieval
   │
Results Returned
```

---

# 7. Promtail Pipeline

```text
Discover Pods
      │
Read Log File
      │
Attach Labels
      │
Create Batch
      │
Push to Gateway
```

Useful verification:

```bash
kubectl logs -n monitoring daemonset/promtail --since=5m
```

Healthy:
- discovering targets
- tail routine started
- no 500/502
- no empty ring

---

# 8. Common Architecture Issues

## 403 AccessDenied

Cause:
Incorrect IAM or missing Workload Identity.

Fix:
Bind Kubernetes Service Account to Google Service Account.

---

## empty ring

Cause:
Write/backend components not healthy.

Verify:

```bash
kubectl get pods -n monitoring
```

---

## 502 Bad Gateway

Cause:
Gateway cannot reach write/read services.

Check:

```bash
kubectl logs -n monitoring deploy/loki-gateway
```

---

# Architecture Verification Checklist

- [ ] Promtail on every node
- [ ] Gateway running
- [ ] Read replicas healthy
- [ ] Write replicas healthy
- [ ] Backend healthy
- [ ] GCS bucket receiving objects
- [ ] Grafana querying logs

---

## Next Part

Part 4 covers the real production issues encountered:
- 403 AccessDenied
- Missing historical logs
- CrashLoopBackOff
- Pending Pods
- Empty Ring
- Root cause analysis and investigation methodology.
# End-to-End GKE Loki Migration Runbook – Part 4

# Production Incident Timeline & Root Cause Analysis

> Append this after Part 3.

---

# 1. Incident Summary

During the production deployment of the Loki Distributed stack on GKE, several issues appeared simultaneously:

- Grafana displayed only recent logs.
- Historical logs were missing.
- Loki Backend entered `CrashLoopBackOff`.
- Promtail reported `500`, `502`, and `empty ring`.
- GCS operations failed with `403 AccessDenied`.

Although these symptoms looked unrelated, they were caused by a small number of underlying configuration issues.

---

# 2. Investigation Strategy

The troubleshooting process followed a structured approach:

```text
User Report
    │
    ▼
Check Pod Health
    │
    ▼
Inspect Logs
    │
    ▼
Validate Storage
    │
    ▼
Validate IAM
    │
    ▼
Validate Workload Identity
    │
    ▼
Migrate Nodes
    │
    ▼
Verify End-to-End Logging
```

---

# 3. Step 1 – Check Pod Status

```bash
kubectl get pods -n monitoring -o wide
```

## Why?

To quickly identify unhealthy components.

Typical findings:

- Running
- Pending
- CrashLoopBackOff
- ImagePullBackOff

---

# 4. Step 2 – Inspect Backend Logs

```bash
kubectl logs -n monitoring loki-backend-0
```

Purpose:

- Detect authentication failures
- Storage connectivity issues
- Startup errors

Observed:

```text
storage.objects.get
403 AccessDenied
```

Interpretation:

The backend could not read or write to Google Cloud Storage.

---

# 5. Step 3 – Validate Bucket Contents

```bash
gcloud storage ls -r gs://resumatch-gke-loki-storage
```

Why?

To confirm whether Loki was successfully writing chunks and indexes.

Observations:

- Initially empty bucket.
- Later, continuous object creation after authentication was fixed.

---

# 6. Step 4 – Check Promtail

```bash
kubectl logs daemonset/promtail -n monitoring --since=5m
```

Observed messages:

```text
500 Internal Server Error
502 Bad Gateway
empty ring
```

Interpretation:

Promtail was healthy but could not deliver logs because Loki services were not fully operational.

---

# 7. Step 5 – Inspect Helm Configuration

```bash
helm get values loki -n monitoring
```

Purpose:

Verify:

- storage_config
- schema_config
- retention
- bucket settings
- persistence

Incorrect values here often lead to startup failures.

---

# 8. Root Cause Matrix

| Symptom | Root Cause | Resolution |
|---------|------------|------------|
| 403 AccessDenied | Incorrect GCP authentication | Configure Workload Identity |
| Missing logs | Backend unable to access GCS | Restore storage access |
| empty ring | Backend/Write unavailable | Fix backend and restart services |
| 502 Gateway | Gateway could not reach healthy services | Recover backend and write components |
| CrashLoopBackOff | Storage initialization failed | Correct IAM and restart |

---

# 9. Lessons

Do not troubleshoot only the visible symptom.

For example:

- `502` was not caused by the Gateway.
- `empty ring` was not caused by Promtail.
- Missing logs were not caused by Grafana.

All three were downstream effects of the backend failing to authenticate with GCS.

---

# 10. Verification After Fix

```bash
kubectl get pods -n monitoring
kubectl logs -n monitoring loki-backend-0
kubectl logs -n monitoring daemonset/promtail --since=5m
gcloud storage ls -r gs://resumatch-gke-loki-storage
```

Expected:

- All pods `Running`
- No `403`
- No `500`
- No `502`
- No `empty ring`
- Continuous objects in the GCS bucket

---

## Next Part

Part 5 covers Google Cloud IAM, Service Accounts, Workload Identity, permissions, and the complete migration from node credentials to Workload Identity with detailed command explanations.
# End-to-End GKE Loki Migration Runbook - Part 5

# Google Cloud IAM & Workload Identity Migration

> Append this after Part 4.

---

# 1. Why Workload Identity?

Initially, Loki accessed Google Cloud Storage using the Compute Engine node's default credentials.

Problems encountered:

- Limited OAuth scopes (`devstorage.read_only`)
- Poor security posture
- Difficult to manage permissions
- Resulted in `403 AccessDenied` when Loki attempted to write objects

Workload Identity solves these issues by allowing Kubernetes Service Accounts (KSAs) to impersonate Google Service Accounts (GSAs) securely.

---

# 2. Architecture Before Migration

```text
Loki Pod
   │
   ▼
Node Default Service Account
   │
   ▼
Limited OAuth Scopes
   │
   ▼
Google Cloud Storage
```

### Issues
- Shared credentials across workloads
- Excessive or insufficient permissions
- No workload isolation

---

# 3. Architecture After Migration

```text
Loki Pod
   │
   ▼
Kubernetes Service Account (KSA)
   │
Workload Identity
   │
   ▼
Google Service Account (GSA)
   │
IAM Permissions
   │
   ▼
Google Cloud Storage
```

Benefits:
- Least privilege access
- Better auditing
- Secure credential management
- No service account keys stored in pods

---

# 4. Enable Workload Identity

```bash
gcloud container clusters update resumatch-cluster-1 \
  --region us-east1 \
  --workload-pool=resumeai-503317.svc.id.goog
```

### Why?

Enables Workload Identity for the cluster.

### Verify

```bash
gcloud container clusters describe resumatch-cluster-1 \
  --region us-east1 \
  --format="value(workloadIdentityConfig.workloadPool)"
```

Expected:

```
resumeai-503317.svc.id.goog
```

---

# 5. Create Google Service Account (GSA)

```bash
gcloud iam service-accounts create loki-gcs
```

### Purpose

Dedicated identity for Loki to access GCS.

---

# 6. Grant IAM Roles

```bash
gcloud projects add-iam-policy-binding resumeai-503317 \
  --member="serviceAccount:loki-gcs@resumeai-503317.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

Optional additional role:

```bash
roles/storage.legacyBucketReader
```

### Why?

Allows Loki to:

- Read chunks
- Write chunks
- Read indexes
- Update metadata

---

# 7. Create Kubernetes Service Account

```bash
kubectl create serviceaccount loki -n monitoring
```

---

# 8. Bind KSA to GSA

```bash
gcloud iam service-accounts add-iam-policy-binding \
  loki-gcs@resumeai-503317.iam.gserviceaccount.com \
  --member="serviceAccount:resumeai-503317.svc.id.goog[monitoring/loki]" \
  --role="roles/iam.workloadIdentityUser"
```

### Why?

Allows the Kubernetes Service Account to impersonate the Google Service Account.

---

# 9. Annotate the KSA

```bash
kubectl annotate serviceaccount loki \
  -n monitoring \
  iam.gke.io/gcp-service-account=loki-gcs@resumeai-503317.iam.gserviceaccount.com
```

### Verify

```bash
kubectl describe sa loki -n monitoring
```

Expected annotation:

```
iam.gke.io/gcp-service-account=...
```

---

# 10. Update Helm Values

Configure Loki components to use the new KSA.

Example:

```yaml
serviceAccount:
  create: false
  name: loki
```

Then upgrade:

```bash
helm upgrade loki grafana/loki \
  -n monitoring \
  -f values.yaml
```

---

# 11. Validate Authentication

Inspect backend logs:

```bash
kubectl logs -n monitoring loki-backend-0
```

Healthy indicators:

- No `403 AccessDenied`
- Successful bucket synchronization
- Compactor initialized

---

# 12. Common Misconfigurations

| Issue | Cause | Fix |
|------|------|------|
| 403 AccessDenied | Missing IAM role | Grant Storage Object Admin |
| Annotation ignored | Wrong KSA name | Match Helm values |
| Workload Identity not used | Old node pool | Migrate to WI-enabled nodes |
| Authentication still failing | Pods not restarted | Rollout restart or Helm upgrade |

---

# 13. Security Best Practices

- Avoid service account keys
- Use least privilege IAM roles
- One GSA per workload
- Rotate permissions through IAM, not secrets
- Audit service account usage regularly

---

# Verification Checklist

- [ ] Workload Identity enabled
- [ ] GSA created
- [ ] IAM roles assigned
- [ ] KSA created
- [ ] KSA annotated
- [ ] Helm updated
- [ ] Pods restarted
- [ ] No 403 errors
- [ ] GCS objects created successfully

---

## Next Part

Part 6 covers node pool migration, draining legacy nodes, scheduling workloads on Workload Identity-enabled nodes, and validating the migration with zero downtime.
# End-to-End GKE Loki Migration Runbook - Part 6

# GKE Node Pool Migration to Workload Identity

> Append this after Part 5.

---

# 1. Objective

After configuring Workload Identity, the existing node pool was still using legacy metadata and OAuth scopes. Pods scheduled on these nodes continued using the old authentication mechanism.

The solution was to create a new node pool configured for Workload Identity, migrate workloads, and safely remove the legacy node pool.

---

# 2. Migration Strategy

```text
Enable Workload Identity
          │
          ▼
Create WI-enabled Node Pool
          │
          ▼
Verify Node Metadata Mode
          │
          ▼
Cordon Legacy Nodes
          │
          ▼
Drain Legacy Nodes
          │
          ▼
Pods Rescheduled
          │
          ▼
Validate Workloads
          │
          ▼
Delete Legacy Node Pool
```

---

# 3. Create a Workload Identity-enabled Node Pool

```bash
gcloud container node-pools create wi-nodepool \
  --cluster=resumatch-cluster-1 \
  --region=us-east1 \
  --workload-metadata=GKE_METADATA
```

### Why?

Creates a node pool where pods can authenticate through Workload Identity instead of node credentials.

---

# 4. Verify Metadata Mode

```bash
gcloud container node-pools describe wi-nodepool \
  --cluster resumatch-cluster-1 \
  --region us-east1 \
  --format="value(config.workloadMetadataConfig.mode)"
```

Expected:

```text
GKE_METADATA
```

---

# 5. Verify Nodes

```bash
kubectl get nodes -o wide
```

Confirm:
- New nodes are `Ready`
- Desired Kubernetes version
- Correct labels and zones

---

# 6. Cordon Legacy Nodes

```bash
kubectl cordon <legacy-node-name>
```

### Why?

Prevents new pods from being scheduled while existing pods continue running.

Verify:

```bash
kubectl get nodes
```

Status should show:

```text
SchedulingDisabled
```

---

# 7. Drain Legacy Nodes

```bash
kubectl drain <legacy-node-name> \
  --ignore-daemonsets \
  --delete-emptydir-data
```

### Why?

Evicts pods so they can be recreated on the new node pool.

Notes:
- `--ignore-daemonsets` keeps DaemonSets (like Promtail) intact.
- `--delete-emptydir-data` allows eviction of pods using temporary storage.

---

# 8. Monitor Pod Rescheduling

```bash
kubectl get pods -A -o wide
```

Verify:
- Pods move from legacy nodes to WI-enabled nodes.
- No workloads remain on drained nodes (except DaemonSets until node removal).

---

# 9. Verify Stateful Workloads

Check StatefulSets:

```bash
kubectl get statefulsets -A
```

Inspect pods:

```bash
kubectl get pods -n monitoring -o wide
```

Ensure:
- `loki-backend`
- `loki-write`
- `loki-read`

are recreated successfully and attached to their PVCs.

---

# 10. Validate Authentication

Backend logs:

```bash
kubectl logs -n monitoring loki-backend-0
```

Healthy output:
- No `403 AccessDenied`
- Bucket synchronization succeeds
- Compactor starts normally

Promtail logs:

```bash
kubectl logs daemonset/promtail -n monitoring --since=5m
```

Healthy output:
- No `500`
- No `502`
- No `empty ring`

---

# 11. Delete Legacy Node Pool

Only after all workloads are verified:

```bash
gcloud container node-pools delete default-pool \
  --cluster resumatch-cluster-1 \
  --region us-east1
```

### Why?

Removes nodes using legacy authentication.

---

# 12. Zero-Downtime Best Practices

- Migrate one node at a time.
- Wait for pods to become `Ready`.
- Validate application endpoints after each drain.
- Monitor Grafana dashboards throughout the migration.
- Avoid draining all nodes simultaneously.

---

# 13. Recovery Steps

If pods fail to schedule:

```bash
kubectl describe pod <pod-name>
```

Look for:
- Insufficient CPU
- Insufficient memory
- PVC attachment errors
- Taints or tolerations

If necessary:

```bash
kubectl uncordon <legacy-node-name>
```

to temporarily restore scheduling.

---

# Verification Checklist

- [ ] WI-enabled node pool created
- [ ] Metadata mode is `GKE_METADATA`
- [ ] Legacy nodes cordoned
- [ ] Legacy nodes drained
- [ ] Pods rescheduled successfully
- [ ] Loki healthy
- [ ] Promtail healthy
- [ ] Grafana functional
- [ ] Legacy node pool removed

---

## Next Part

Part 7 covers end-to-end validation, Grafana configuration, Loki datasource verification, LogQL queries, GCS validation, and production health checks after migration.
# End-to-End GKE Loki Migration Runbook – Part 7

# Production Validation, Grafana, LogQL & End-to-End Verification

> Append this after Part 6.

---

# 1. Objective

After completing the Workload Identity migration and node migration, verify that the entire logging pipeline is healthy from application pods to Grafana dashboards.

---

# 2. End-to-End Validation Flow

```text
Application
    │
stdout/stderr
    │
Promtail
    │
Loki Gateway
    │
Write
    │
Backend
    │
Google Cloud Storage
    │
Read
    │
Grafana
```

Every component in this chain must be validated individually.

---

# 3. Verify Monitoring Pods

```bash
kubectl get pods -n monitoring -o wide
```

Expected:

- Running
- Ready
- Restart count stable

Investigate immediately if any pod is:

- Pending
- CrashLoopBackOff
- Error
- ContainerCreating

---

# 4. Verify Loki Services

```bash
kubectl get svc -n monitoring
```

Expected services:

- loki-gateway
- loki-read
- loki-write
- grafana

---

# 5. Verify Endpoints

```bash
kubectl get endpoints -n monitoring
```

Purpose:

Ensure services have healthy backend pods.

Empty endpoints usually indicate:

- Selector mismatch
- Pods not Ready
- Deployment failure

---

# 6. Verify Promtail

```bash
kubectl logs daemonset/promtail \
-n monitoring \
--since=10m
```

Healthy output contains:

- discovering targets
- tail routine started

Should NOT contain:

- empty ring
- 500
- 502

---

# 7. Verify Backend

```bash
kubectl logs \
loki-backend-0 \
-n monitoring
```

Healthy indicators:

- Compactor initialized
- Bucket sync successful
- No storage errors

Should NOT contain:

```
403 AccessDenied
```

---

# 8. Validate Bucket

```bash
gcloud storage ls -r \
gs://resumatch-gke-loki-storage
```

Expected:

Continuous creation of:

- chunks
- indexes
- metadata

This confirms Loki is ingesting data.

---

# 9. Validate Grafana Datasource

Open Grafana

Navigate:

Connections

↓

Data Sources

↓

Loki

Click:

Test & Save

Expected:

```
Datasource is working
```

---

# 10. Basic LogQL Queries

Show all logs

```logql
{}
```

Namespace

```logql
{namespace="resumatch-ai"}
```

Backend logs

```logql
{app="backend"}
```

Frontend logs

```logql
{app="frontend"}
```

Last errors

```logql
{app="backend"} |= "ERROR"
```

HTTP Requests

```logql
{app="backend"} |= "GET"
```

---

# 11. Health Endpoints

Gateway

```bash
curl http://loki-gateway/ready
```

Backend

```bash
curl http://loki-backend:3100/ready
```

Expected

```
ready
```

---

# 12. Kubernetes Validation

Application pods

```bash
kubectl get pods \
-n resumatch-ai
```

Confirm:

- Running
- Ready
- Restart count stable

---

# 13. Production Health Checklist

✔ Promtail collecting logs

✔ Gateway healthy

✔ Write healthy

✔ Backend healthy

✔ Read healthy

✔ Grafana datasource healthy

✔ Queries returning logs

✔ Objects written to GCS

✔ No authentication failures

✔ No ring errors

---

# 14. Common Validation Failures

## No Logs

Check:

- Promtail
- Gateway
- Datasource
- Labels

---

## Only New Logs

Check:

Backend

Storage

Retention

Compactor

---

## Query Timeout

Check:

Read pods

CPU

Memory

Cache

---

## Dashboard Empty

Verify:

Datasource

Labels

Namespace

Time Range

---

# 15. Final Production Acceptance Criteria

The migration is complete only if:

- Every monitoring pod is Running
- Every endpoint is healthy
- GCS objects are continuously created
- Grafana dashboards show live logs
- Historical logs are accessible
- No authentication errors remain
- No CrashLoopBackOff pods
- No Pending pods
- No 500/502 errors
- No empty ring errors

---

## Next Part

Part 8 will cover:
- Production troubleshooting playbooks
- Failure scenarios
- Rollback procedures
- Disaster Recovery
- Backup strategy
- Retention policies
- Operational runbooks
# End-to-End GKE Loki Migration Runbook – Part 8

# Production Troubleshooting Playbooks & Disaster Recovery

> Append this after Part 7.

---

# 1. Purpose

This section provides standardized operational procedures (runbooks) for diagnosing and resolving common production issues affecting the Loki logging platform.

---

# 2. Troubleshooting Workflow

```text
Alert Received
      │
      ▼
Check Pod Status
      │
      ▼
Inspect Logs
      │
      ▼
Verify Services
      │
      ▼
Verify Storage
      │
      ▼
Verify IAM / Workload Identity
      │
      ▼
Validate Application
      │
      ▼
Close Incident
```

---

# 3. Playbook: 403 AccessDenied

## Symptoms

- Loki backend CrashLoopBackOff
- Missing historical logs
- GCS read/write failures

## Verify

```bash
kubectl logs -n monitoring loki-backend-0
```

Look for:

```text
403 AccessDenied
storage.objects.get
```

## Root Cause

- Missing IAM permissions
- Incorrect GSA/KSA binding
- Workload Identity not active
- Pods still running on legacy nodes

## Resolution

1. Verify Workload Identity is enabled.
2. Check GSA IAM roles.
3. Verify KSA annotation.
4. Restart affected pods.
5. Confirm GCS object creation.

---

# 4. Playbook: 500 / 502 Errors

## Symptoms

Promtail logs:

```text
500
502
```

## Verify

```bash
kubectl logs daemonset/promtail -n monitoring
kubectl get pods -n monitoring
```

## Root Cause

- Gateway unavailable
- Backend unhealthy
- Write pods restarting

## Resolution

- Restore backend health.
- Validate endpoints.
- Restart gateway if required.

---

# 5. Playbook: Empty Ring

## Symptoms

```text
empty ring
```

## Verify

```bash
kubectl get pods -n monitoring
```

## Root Cause

- Ring members unavailable
- Write or backend pods failed
- Gossip not initialized

## Resolution

- Recover failed pods.
- Verify StatefulSets.
- Wait for ring stabilization.

---

# 6. Playbook: Pending Pods

## Verify

```bash
kubectl describe pod <pod-name>
```

Common causes:

- Insufficient CPU
- Insufficient memory
- PVC not bound
- Node taints

### Resolution

- Scale node pool.
- Increase resources.
- Resolve PVC issues.
- Add tolerations if required.

---

# 7. Playbook: CrashLoopBackOff

## Verify

```bash
kubectl logs <pod-name> -n monitoring
```

Possible causes:

- Invalid configuration
- Storage authentication
- Missing secrets
- Startup probe failures

Resolution depends on log output.

---

# 8. Network Troubleshooting

Check services:

```bash
kubectl get svc -n monitoring
```

Check endpoints:

```bash
kubectl get endpoints -n monitoring
```

DNS test:

```bash
kubectl exec <pod> -- nslookup loki-gateway
```

---

# 9. Disaster Recovery Strategy

## Components

- Helm values
- GCS bucket
- Persistent Volumes
- Grafana dashboards
- Alert rules

Back up regularly.

---

# 10. Backup Recommendations

Export Helm values:

```bash
helm get values loki -n monitoring > values-backup.yaml
```

Export Kubernetes resources:

```bash
kubectl get all -n monitoring -o yaml > monitoring-backup.yaml
```

---

# 11. Restore Procedure

1. Create namespace.
2. Restore Helm values.
3. Restore IAM configuration.
4. Restore dashboards.
5. Verify Workload Identity.
6. Validate logging.

---

# 12. Rollback Procedure

Rollback Helm release:

```bash
helm history loki -n monitoring
helm rollback loki <REVISION> -n monitoring
```

Verify:

```bash
kubectl rollout status statefulset/loki-backend -n monitoring
```

---

# 13. Operational Checklist

Daily:
- Review Grafana dashboards.
- Check pod health.
- Verify GCS writes.

Weekly:
- Review IAM.
- Check storage growth.
- Validate retention.

Monthly:
- Test restore process.
- Review Helm chart updates.
- Audit Workload Identity bindings.

---

# 14. Incident Closure Checklist

- [ ] Root cause identified
- [ ] Service restored
- [ ] Logs available
- [ ] Alerts cleared
- [ ] Documentation updated
- [ ] Preventive actions recorded

---

## Next Part

Part 9 will cover:
- Production hardening
- Security best practices
- Retention tuning
- Performance optimization
- Scaling Loki
- Capacity planning
- Monitoring and alerting architecture
# End-to-End GKE Loki Migration Runbook – Part 9

# Production Hardening, Performance Tuning & Capacity Planning

> Append this after Part 8.

---

# 1. Objective

After the logging platform is stable, the next goal is to harden it for production by improving security, scalability, performance, observability, and cost efficiency.

---

# 2. Production Hardening Checklist

## Kubernetes

- Enable RBAC with least privilege
- Use dedicated namespaces
- Apply NetworkPolicies
- Configure Pod Security Admission
- Enforce resource requests and limits
- Enable audit logging

## Google Cloud

- Use Workload Identity (avoid service account keys)
- Grant least-privilege IAM roles
- Enable Cloud Audit Logs
- Restrict bucket access
- Enable bucket versioning (if required)

---

# 3. Resource Requests & Limits

Example:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "1Gi"
  limits:
    cpu: "2"
    memory: "4Gi"
```

Why?

- Prevent noisy neighbors
- Improve scheduler decisions
- Avoid OOMKills

Verify:

```bash
kubectl top pods -n monitoring
```

---

# 4. Loki Scaling Strategy

## Write

Scale when:

- High ingestion rate
- Many Promtail agents
- Increased log volume

```bash
kubectl scale deployment loki-write \
  --replicas=3 -n monitoring
```

## Read

Scale when:

- Dashboard latency increases
- Query concurrency rises

```bash
kubectl scale deployment loki-read \
  --replicas=3 -n monitoring
```

---

# 5. Storage Optimization

Monitor GCS growth:

```bash
gcloud storage du gs://resumatch-gke-loki-storage
```

Recommendations:

- Review retention regularly
- Remove obsolete data
- Compress where applicable

---

# 6. Retention Policy

Example:

```yaml
limits_config:
  retention_period: 30d
```

Guidelines:

- Development: 7–14 days
- Staging: 14–30 days
- Production: 30–90 days (or based on compliance)

---

# 7. Compactor

Responsibilities:

- Remove expired data
- Compact indexes
- Improve query performance

Verify:

```bash
kubectl logs -n monitoring loki-backend-0
```

Look for successful compaction events.

---

# 8. Cache Optimization

Recommended caches:

- Chunks Cache
- Results Cache

Benefits:

- Lower query latency
- Reduced object storage reads
- Lower infrastructure costs

---

# 9. Horizontal Pod Autoscaler (HPA)

Example:

```bash
kubectl autoscale deployment loki-read \
  --cpu-percent=70 \
  --min=2 \
  --max=10
```

Why?

Automatically scales based on CPU utilization.

---

# 10. Monitoring Metrics

Track:

- Pod CPU
- Pod Memory
- Restarts
- Query latency
- Log ingestion rate
- GCS request failures
- Compaction duration
- Storage growth

---

# 11. Recommended Alerts

Critical:

- Backend unavailable
- Gateway unavailable
- No log ingestion
- Authentication failures
- High restart count

Warning:

- High CPU
- High memory
- Large storage growth
- Slow queries

---

# 12. Capacity Planning

Review monthly:

- Number of nodes
- Log volume
- Query load
- Storage usage
- Dashboard performance

Scale before saturation.

---

# 13. Cost Optimization

Recommendations:

- Apply retention policies
- Use autoscaling
- Remove unused dashboards
- Archive old logs if required
- Right-size node pools

---

# 14. Production Readiness Checklist

- [ ] RBAC configured
- [ ] NetworkPolicies applied
- [ ] Workload Identity enabled
- [ ] Resource limits configured
- [ ] HPA configured
- [ ] Retention configured
- [ ] Monitoring dashboards reviewed
- [ ] Alerts tested
- [ ] Backup strategy validated
- [ ] Disaster recovery documented

---

## Next Part

Part 10 will include:
- Complete command reference
- Helm cheat sheet
- kubectl troubleshooting guide
- GCloud commands
- LogQL reference
- Validation scripts
- Operational quick-reference tables
# End-to-End GKE Loki Migration Runbook – Part 10

# Complete Command Reference & Operational Cheat Sheet

> Append this after Part 9.

---

# 1. Purpose

This section provides a quick-reference guide for the commands most frequently used to deploy, operate, validate, troubleshoot, and recover the Loki logging platform in production.

---

# 2. Kubernetes Commands

## Cluster Information

```bash
kubectl cluster-info
kubectl version
kubectl get nodes -o wide
```

Purpose:
- Verify API server connectivity
- Check Kubernetes version
- Inspect node health

---

## Namespace Operations

```bash
kubectl get ns
kubectl create namespace monitoring
kubectl delete namespace monitoring
```

---

## Pod Operations

List pods:

```bash
kubectl get pods -A
kubectl get pods -n monitoring -o wide
```

Describe a pod:

```bash
kubectl describe pod <pod-name> -n monitoring
```

Delete a pod:

```bash
kubectl delete pod <pod-name> -n monitoring
```

Restart a deployment:

```bash
kubectl rollout restart deployment/<deployment-name> -n monitoring
```

---

# 3. StatefulSet Operations

```bash
kubectl get statefulsets -A
kubectl rollout status statefulset/loki-backend -n monitoring
kubectl describe statefulset loki-backend -n monitoring
```

---

# 4. Service Operations

```bash
kubectl get svc -n monitoring
kubectl get endpoints -n monitoring
kubectl describe svc loki-gateway -n monitoring
```

---

# 5. Log Collection

Application logs:

```bash
kubectl logs <pod-name> -n resumatch-ai
```

Backend logs:

```bash
kubectl logs loki-backend-0 -n monitoring
```

Promtail:

```bash
kubectl logs daemonset/promtail -n monitoring --since=10m
```

Follow logs:

```bash
kubectl logs -f <pod-name> -n monitoring
```

---

# 6. Helm Commands

Repositories:

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
```

Install:

```bash
helm install loki grafana/loki -n monitoring -f values.yaml
```

Upgrade:

```bash
helm upgrade loki grafana/loki -n monitoring -f values.yaml
```

History:

```bash
helm history loki -n monitoring
```

Rollback:

```bash
helm rollback loki <revision> -n monitoring
```

Current values:

```bash
helm get values loki -n monitoring
```

---

# 7. GCloud Commands

Cluster:

```bash
gcloud container clusters list
gcloud container clusters describe resumatch-cluster-1 --region us-east1
```

Node pools:

```bash
gcloud container node-pools list --cluster resumatch-cluster-1 --region us-east1
```

Workload Identity:

```bash
gcloud container clusters describe resumatch-cluster-1 \
--region us-east1 \
--format="value(workloadIdentityConfig.workloadPool)"
```

---

# 8. IAM Commands

Create GSA:

```bash
gcloud iam service-accounts create loki-gcs
```

Grant role:

```bash
gcloud projects add-iam-policy-binding resumeai-503317 \
--member="serviceAccount:loki-gcs@resumeai-503317.iam.gserviceaccount.com" \
--role="roles/storage.objectAdmin"
```

---

# 9. GCS Commands

List bucket:

```bash
gcloud storage ls
```

Inspect objects:

```bash
gcloud storage ls -r gs://resumatch-gke-loki-storage
```

Storage usage:

```bash
gcloud storage du gs://resumatch-gke-loki-storage
```

---

# 10. LogQL Cheat Sheet

All logs:

```logql
{}
```

Namespace:

```logql
{namespace="resumatch-ai"}
```

Backend:

```logql
{app="backend"}
```

Errors:

```logql
{app="backend"} |= "ERROR"
```

HTTP Requests:

```logql
{app="backend"} |= "GET"
```

---

# 11. Validation Commands

Pods:

```bash
kubectl get pods -A
```

Services:

```bash
kubectl get svc -n monitoring
```

Endpoints:

```bash
kubectl get endpoints -n monitoring
```

PVCs:

```bash
kubectl get pvc -n monitoring
```

Node health:

```bash
kubectl top nodes
```

Pod health:

```bash
kubectl top pods -n monitoring
```

---

# 12. Common Troubleshooting Commands

| Problem | Command |
|---------|---------|
| CrashLoopBackOff | kubectl logs <pod> |
| Pending Pod | kubectl describe pod <pod> |
| Missing Service | kubectl get svc |
| Empty Endpoints | kubectl get endpoints |
| IAM Issue | kubectl logs loki-backend-0 |
| GCS Validation | gcloud storage ls -r |
| Helm Values | helm get values loki |

---

# 13. Operational Quick Checklist

Daily:
- Check pods
- Review dashboards
- Validate log ingestion

Weekly:
- Review IAM bindings
- Verify retention
- Inspect storage growth

Monthly:
- Test rollback
- Test disaster recovery
- Review Helm updates

---

## Next Part

Part 11 covers the complete observability architecture:
- Prometheus
- Grafana
- Alertmanager
- Jaeger
- OpenTelemetry
- Metrics, logs, and traces integration
- Alert design
- SLOs and SLIs
# End-to-End GKE Loki Migration Runbook – Part 11

# Enterprise Observability Architecture

> Append this after Part 10.

---

# 1. Objective

Modern production platforms require unified observability across metrics, logs, traces, and alerts. This section documents the complete observability architecture deployed on GKE and explains how each component integrates with the others.

---

# 2. High-Level Observability Architecture

```text
                +----------------------+
                |   Application Pods   |
                +----------+-----------+
                           |
      +--------------------+--------------------+
      |                    |                    |
      v                    v                    v
 OpenTelemetry        Promtail           Prometheus
  (Traces)             (Logs)             (Metrics)
      |                    |                    |
      v                    v                    v
    Jaeger              Loki Gateway      Prometheus TSDB
      |                    |                    |
      +----------+---------+--------------------+
                 |
                 v
              Grafana
                 |
                 v
           Dashboards & Alerts
```

---

# 3. Metrics Architecture

## Prometheus Responsibilities

- Scrape Kubernetes metrics
- Scrape application metrics
- Store time-series data
- Evaluate alert rules
- Feed Grafana dashboards

Verify:

```bash
kubectl get pods -n monitoring | grep prometheus
```

Targets:

```bash
kubectl port-forward svc/prometheus-server 9090 -n monitoring
```

Navigate to:

```
Status → Targets
```

Expected:

- All targets UP
- No scrape failures

---

# 4. Logging Architecture

Flow:

```text
Container Logs
      │
      ▼
Promtail
      │
      ▼
Loki Gateway
      │
      ▼
Write → Backend → GCS
      │
      ▼
Read
      │
      ▼
Grafana Explore
```

Validation:

```bash
kubectl logs daemonset/promtail -n monitoring
```

---

# 5. Tracing Architecture

## OpenTelemetry

Responsibilities:

- Instrument applications
- Export spans
- Correlate requests

Exporters:

- OTLP HTTP
- OTLP gRPC

Example environment variable:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

---

## Jaeger

Responsibilities:

- Receive traces
- Store spans
- Visualize distributed requests

Verify:

```bash
kubectl get pods -n monitoring | grep jaeger
```

---

# 6. Grafana

Grafana integrates:

- Metrics (Prometheus)
- Logs (Loki)
- Traces (Jaeger)

Recommended dashboards:

- Kubernetes Cluster
- Node Exporter
- Application Overview
- Loki Logs
- Request Latency
- Error Rate

---

# 7. Metrics, Logs & Traces Correlation

Example workflow:

1. Alert fires in Prometheus.
2. Open Grafana dashboard.
3. Inspect application metrics.
4. Jump to related Loki logs.
5. Open Jaeger trace.
6. Identify failing service.

This reduces Mean Time to Resolution (MTTR).

---

# 8. Alertmanager

Responsibilities:

- Deduplicate alerts
- Route notifications
- Group alerts
- Silence maintenance windows

Common notification channels:

- Email
- Slack
- Microsoft Teams
- PagerDuty
- Webhooks

---

# 9. SLI & SLO Examples

## Availability

SLI:

```
Successful requests / Total requests
```

SLO:

```
99.9% monthly availability
```

## Latency

SLI:

```
95th percentile response time
```

SLO:

```
< 300 ms
```

## Error Rate

SLI:

```
5xx responses / Total requests
```

SLO:

```
< 1%
```

---

# 10. Recommended Alerts

Critical:

- Loki backend unavailable
- Prometheus target down
- Grafana unavailable
- High error rate
- Authentication failures
- No log ingestion

Warning:

- CPU > 80%
- Memory > 80%
- Disk usage > 80%
- Storage growth abnormal
- Slow queries

---

# 11. Dashboard Validation

Daily:

- Review cluster health
- Check ingestion rate
- Verify alert status

Weekly:

- Review storage growth
- Inspect query latency
- Validate dashboards

Monthly:

- Review SLO compliance
- Audit alert noise
- Update dashboards

---

# 12. Enterprise Best Practices

- Standardize labels
- Instrument every service
- Correlate metrics, logs, and traces
- Keep dashboards version-controlled
- Review alerts regularly
- Remove obsolete dashboards
- Test alert routing quarterly

---

# Observability Readiness Checklist

- [ ] Prometheus scraping healthy
- [ ] Grafana dashboards available
- [ ] Loki ingesting logs
- [ ] Jaeger receiving traces
- [ ] Alertmanager routing alerts
- [ ] SLIs defined
- [ ] SLOs documented
- [ ] Dashboards reviewed
- [ ] Alerts tested

---

## Next Part

Part 12 covers CI/CD integration, Helm release management, GitHub Actions, GitOps practices, automated validation, and production deployment pipelines.
# End-to-End GKE Loki Migration Runbook – Part 12

# CI/CD Integration, GitOps & Automated Deployments

> Append this after Part 11.

---

# 1. Objective

A production observability platform should be deployed and maintained through automated CI/CD pipelines rather than manual changes. This section describes recommended deployment workflows using GitHub Actions, Helm, and GitOps principles.

---

# 2. Recommended CI/CD Architecture

```text
Developer
    │
    ▼
Git Push
    │
    ▼
GitHub Actions
    │
    ├── Lint
    ├── Unit Tests
    ├── Security Scans
    ├── Build Images
    ├── Push Images
    ├── Helm Validation
    ├── Deploy to GKE
    └── Post-Deployment Validation
            │
            ▼
         Grafana
         Loki
         Prometheus
```

---

# 3. Pipeline Stages

1. Checkout repository
2. Install dependencies
3. Run linting
4. Execute unit tests
5. Perform vulnerability scanning
6. Build Docker images
7. Push images to registry
8. Validate Helm charts
9. Deploy to Kubernetes
10. Verify rollout
11. Run smoke tests

---

# 4. Helm Validation

Validate manifests before deployment:

```bash
helm lint charts/loki
helm template charts/loki
```

Purpose:

- Catch syntax errors
- Validate values
- Review rendered manifests

---

# 5. Kubernetes Validation

Before deployment:

```bash
kubectl apply --dry-run=client -f manifests/
```

Verify cluster connectivity:

```bash
kubectl cluster-info
```

---

# 6. Deployment

Deploy or upgrade using Helm:

```bash
helm upgrade --install loki grafana/loki \
  -n monitoring \
  -f values.yaml
```

Verify rollout:

```bash
kubectl rollout status statefulset/loki-backend -n monitoring
```

---

# 7. Post-Deployment Validation

Run the following checks:

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
kubectl get endpoints -n monitoring
```

Confirm:

- Pods are Running
- Services have endpoints
- No CrashLoopBackOff

---

# 8. Automated Smoke Tests

Recommended checks:

- Grafana responds
- Loki datasource healthy
- Promtail collecting logs
- GCS bucket receiving objects
- Prometheus targets UP

---

# 9. GitOps Best Practices

- Store Helm values in Git
- Review changes through pull requests
- Version dashboards
- Version alert rules
- Avoid manual changes in production
- Use environment-specific values files

---

# 10. Rollback Strategy

If deployment fails:

```bash
helm history loki -n monitoring
helm rollback loki <REVISION> -n monitoring
```

Verify:

```bash
kubectl rollout status statefulset/loki-backend -n monitoring
```

---

# 11. Deployment Checklist

Before Deployment

- [ ] CI pipeline successful
- [ ] Security scan passed
- [ ] Helm lint passed
- [ ] Helm template reviewed
- [ ] Cluster healthy

After Deployment

- [ ] Pods Running
- [ ] Grafana accessible
- [ ] Loki healthy
- [ ] Promtail healthy
- [ ] Metrics visible
- [ ] Logs visible
- [ ] Alerts operational

---

# 12. Operational Recommendations

- Automate deployments
- Avoid direct production edits
- Use Helm releases for traceability
- Test rollback procedures regularly
- Monitor deployments using Grafana dashboards

---

## Next Part

Part 13 covers enterprise security architecture including:
- IAM
- RBAC
- Network Policies
- Secrets Management
- Audit Logging
- Compliance
- Policy Enforcement
# End-to-End GKE Loki Migration Runbook – Part 13

# Enterprise Security Architecture & Compliance

> Append this after Part 12.

---

# 1. Objective

This section documents the security architecture and operational controls required to run the GKE observability platform securely in production. The goal is to implement defense in depth while following cloud-native security best practices.

---

# 2. Security Architecture

```text
                Internet
                    │
          Cloud Load Balancer
                    │
             Ingress Controller
                    │
      ┌─────────────┴─────────────┐
      │                           │
  Application Namespace      Monitoring Namespace
      │                           │
      │                    Grafana / Loki /
      │                  Prometheus / Jaeger
      │                           │
      └─────────────┬─────────────┘
                    │
              Network Policies
                    │
          Kubernetes API Server
                    │
         Workload Identity (KSA→GSA)
                    │
                Google Cloud IAM
                    │
          Google Cloud Storage (GCS)
```

---

# 3. Identity & Access Management (IAM)

## Principles

- Least privilege
- Separation of duties
- No long-lived service account keys
- One Google Service Account (GSA) per workload
- Use Workload Identity instead of node credentials

Recommended IAM roles:

- `roles/storage.objectAdmin` (only where required)
- `roles/monitoring.viewer`
- `roles/logging.viewer`

Review IAM bindings regularly and remove unused permissions.

---

# 4. Kubernetes RBAC

Use Kubernetes Roles and RoleBindings to limit access.

Example responsibilities:

- Developers: read-only access to logs
- SREs: manage monitoring resources
- Cluster admins: infrastructure administration

Avoid granting `cluster-admin` broadly.

Verify RBAC:

```bash
kubectl auth can-i get pods --as=<user>
kubectl auth can-i create deployments --as=<user>
```

---

# 5. Network Policies

Restrict communication between namespaces and workloads.

Recommended policies:

- Allow Promtail → Loki Gateway
- Allow Grafana → Loki Read
- Allow Grafana → Prometheus
- Deny all other unnecessary ingress/egress

Validate:

```bash
kubectl get networkpolicy -A
```

---

# 6. Secrets Management

Never store secrets in Git repositories.

Recommended options:

- Google Secret Manager
- External Secrets Operator
- Sealed Secrets
- HashiCorp Vault

Best practices:

- Rotate secrets regularly
- Limit access by namespace
- Audit secret usage

---

# 7. Pod Security

Enforce secure pod settings:

- Run as non-root
- Read-only root filesystem (where possible)
- Drop Linux capabilities
- Use seccomp profiles
- Avoid privileged containers

Review SecurityContext in Helm values before deployment.

---

# 8. Audit Logging

Enable:

- Kubernetes Audit Logs
- Google Cloud Audit Logs
- IAM Audit Logs
- GCS Data Access Logs

Review logs periodically for:

- Unauthorized access
- Permission changes
- Unexpected API activity

---

# 9. Compliance Considerations

Depending on organizational requirements, align with:

- ISO 27001
- SOC 2
- PCI DSS (if applicable)
- GDPR (where applicable)

Ensure log retention matches regulatory requirements.

---

# 10. Policy Enforcement

Use admission controls such as:

- Gatekeeper (OPA)
- Kyverno

Recommended policies:

- Block privileged containers
- Require resource requests/limits
- Enforce approved container registries
- Require labels and annotations
- Prevent latest image tags in production

---

# 11. Security Monitoring

Monitor for:

- Authentication failures
- Repeated CrashLoopBackOff events
- Unexpected namespace creation
- Excessive IAM changes
- High-risk Kubernetes API calls

Integrate alerts with Alertmanager.

---

# 12. Security Review Checklist

Identity

- [ ] Workload Identity enabled
- [ ] No service account keys in use
- [ ] IAM roles reviewed

Kubernetes

- [ ] RBAC configured
- [ ] Network Policies applied
- [ ] Pod Security enforced

Secrets

- [ ] Secrets externalized
- [ ] Rotation policy defined

Logging

- [ ] Audit logs enabled
- [ ] Security alerts configured

Compliance

- [ ] Retention documented
- [ ] Backup strategy tested

---

# 13. Incident Response Guidance

When a security event occurs:

1. Isolate affected workload.
2. Preserve logs and audit trails.
3. Identify scope of impact.
4. Rotate credentials if required.
5. Restore service safely.
6. Conduct a post-incident review.
7. Update preventive controls.

---

## Next Part

Part 14 covers the SRE Operations Handbook:
- Daily operational tasks
- On-call procedures
- Incident management
- Maintenance windows
- Upgrade strategy
- Capacity reviews
- Postmortems
- Operational checklists
# End-to-End GKE Loki Migration Runbook – Part 14

# SRE Operations Handbook

> Append this after Part 13.

---

# 1. Objective

This handbook defines the standard operating procedures (SOPs) for Site Reliability Engineers (SREs) managing the GKE observability platform in production. It covers routine operations, incident response, upgrades, maintenance, disaster recovery, and continuous improvement.

---

# 2. Daily Operations Checklist

## Cluster Health

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl top nodes
kubectl top pods -A
```

Verify:
- All nodes are `Ready`
- No unexpected pod restarts
- CPU and memory utilization within thresholds

---

## Monitoring Stack

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
kubectl get endpoints -n monitoring
```

Confirm:
- Loki components are healthy
- Prometheus targets are UP
- Grafana is reachable
- Jaeger is available

---

## Logging Validation

Run LogQL queries in Grafana:

```logql
{}
{namespace="resumatch-ai"}
{app="backend"} |= "ERROR"
```

Ensure:
- Logs are arriving continuously
- No ingestion gaps
- Historical logs are accessible

---

# 3. Weekly Operations

Tasks:

- Review GCS storage growth
- Verify retention policy
- Review IAM bindings
- Inspect alert history
- Validate dashboard accuracy
- Review failed deployments

Commands:

```bash
gcloud storage du gs://resumatch-gke-loki-storage
helm list -n monitoring
kubectl get events -A --sort-by=.lastTimestamp
```

---

# 4. Monthly Operations

- Test backup restoration
- Verify disaster recovery documentation
- Upgrade Helm repositories
- Review Kubernetes version
- Audit RBAC and NetworkPolicies
- Review SLO compliance

---

# 5. Incident Management Lifecycle

```text
Alert
  │
  ▼
Acknowledge
  │
  ▼
Assess Impact
  │
  ▼
Mitigate
  │
  ▼
Identify Root Cause
  │
  ▼
Restore Service
  │
  ▼
Postmortem
```

---

# 6. On-Call Procedures

When paged:

1. Acknowledge the alert.
2. Determine severity.
3. Check dashboards.
4. Review logs.
5. Escalate if required.
6. Apply mitigation.
7. Verify recovery.
8. Document findings.

---

# 7. Maintenance Windows

Before maintenance:

- Notify stakeholders
- Confirm backups
- Verify rollback plan
- Freeze non-essential deployments

During maintenance:

- Monitor dashboards
- Validate workloads after each change

After maintenance:

- Confirm service health
- Close maintenance window
- Record changes

---

# 8. Upgrade Strategy

Recommended order:

1. Kubernetes control plane
2. Node pools
3. Helm repositories
4. Loki
5. Prometheus
6. Grafana
7. Jaeger
8. Promtail

Always:
- Read release notes
- Test in staging
- Backup configuration
- Verify rollback path

---

# 9. Capacity Review

Monthly metrics:

- Cluster utilization
- Pod count
- Log ingestion rate
- Query latency
- Storage growth
- Alert volume

Scale proactively before limits are reached.

---

# 10. Disaster Recovery Drill

Quarterly:

1. Restore Helm values.
2. Restore monitoring namespace.
3. Verify Workload Identity.
4. Validate Grafana dashboards.
5. Confirm log ingestion.
6. Document recovery time (RTO) and recovery point (RPO).

---

# 11. Postmortem Template

## Summary

- Incident ID
- Date
- Duration
- Impact

## Timeline

- Detection
- Mitigation
- Resolution

## Root Cause

Describe the technical cause.

## Corrective Actions

- Immediate fixes
- Long-term improvements
- Preventive controls

---

# 12. Operational KPIs

Track:

- Mean Time to Detect (MTTD)
- Mean Time to Resolve (MTTR)
- Availability
- Error Rate
- Deployment Success Rate
- Alert Noise Ratio

---

# 13. Final Operational Checklist

Daily

- [ ] Cluster healthy
- [ ] Monitoring healthy
- [ ] Logs flowing
- [ ] Alerts reviewed

Weekly

- [ ] Storage reviewed
- [ ] IAM audited
- [ ] Dashboards validated

Monthly

- [ ] Backup tested
- [ ] Disaster recovery validated
- [ ] Capacity reviewed
- [ ] Documentation updated

---

## Next Part

Part 15 will conclude the runbook with:
- Master appendix
- Consolidated command index
- Architecture index
- Glossary
- Troubleshooting decision tree
- Final recommendations
- Document completion
# End-to-End GKE Loki Migration Runbook – Part 15

# Master Appendix, Glossary & Final Recommendations

> Append this after Part 14.

---

# 1. Master Table of Contents

1. Introduction & Architecture
2. Initial Deployment
3. Loki Architecture Deep Dive
4. Incident Timeline & Root Cause Analysis
5. IAM & Workload Identity
6. Node Pool Migration
7. Validation & Verification
8. Troubleshooting & Disaster Recovery
9. Production Hardening
10. Command Reference
11. Enterprise Observability
12. CI/CD & GitOps
13. Enterprise Security
14. SRE Operations
15. Appendix & Glossary

---

# 2. Architecture Index

## Infrastructure
- Google Kubernetes Engine (GKE)
- Google Cloud Storage (GCS)
- Workload Identity
- IAM

## Observability
- Promtail
- Loki Gateway
- Loki Read
- Loki Write
- Loki Backend
- Prometheus
- Grafana
- Jaeger
- OpenTelemetry

---

# 3. Troubleshooting Decision Tree

```text
Alert
 │
 ▼
Pods Healthy?
 ├─ No → Describe Pod → Review Logs
 └─ Yes
      │
      ▼
Logs Missing?
 ├─ Check Promtail
 ├─ Check Gateway
 ├─ Check Backend
 └─ Check GCS
      │
      ▼
403?
 ├─ Verify Workload Identity
 ├─ Verify IAM
 └─ Restart Pods
      │
      ▼
Validate Grafana
```

---

# 4. Quick Command Index

## Kubernetes

```bash
kubectl get pods -A
kubectl get svc -A
kubectl get endpoints -A
kubectl describe pod <pod>
kubectl logs <pod>
kubectl top nodes
kubectl top pods
```

## Helm

```bash
helm list
helm history loki
helm rollback loki <revision>
helm get values loki
```

## Google Cloud

```bash
gcloud container clusters describe resumatch-cluster-1
gcloud storage ls
gcloud storage ls -r gs://resumatch-gke-loki-storage
```

---

# 5. Glossary

| Term | Description |
|------|-------------|
| GKE | Google Kubernetes Engine |
| GCS | Google Cloud Storage |
| KSA | Kubernetes Service Account |
| GSA | Google Service Account |
| Workload Identity | Secure mapping of KSA to GSA |
| TSDB | Time Series Database |
| LogQL | Loki query language |
| HPA | Horizontal Pod Autoscaler |
| MTTR | Mean Time To Resolve |
| MTTD | Mean Time To Detect |
| SLI | Service Level Indicator |
| SLO | Service Level Objective |

---

# 6. Production Readiness Matrix

| Area | Status Criteria |
|------|-----------------|
| Infrastructure | Healthy nodes and control plane |
| Security | IAM, RBAC, Network Policies, Workload Identity |
| Logging | Promtail → Loki → GCS operational |
| Metrics | Prometheus targets UP |
| Tracing | Jaeger receiving spans |
| Dashboards | Grafana operational |
| Alerting | Alerts tested and routed |
| Backups | Recovery validated |
| Operations | SOPs documented |
| DR | Restore tested |

---

# 7. Lessons Learned

- Design authentication before deployment.
- Prefer Workload Identity over node credentials.
- Validate storage access early.
- Use Helm and GitOps for repeatable deployments.
- Correlate metrics, logs and traces during incidents.
- Test rollback and disaster recovery regularly.
- Keep operational documentation current.

---

# 8. Final Recommendations

- Standardize infrastructure as code.
- Keep Helm values under version control.
- Monitor capacity and storage growth.
- Review IAM and RBAC quarterly.
- Test upgrades in staging before production.
- Perform regular restore drills.
- Measure and improve SLO compliance.

---

# 9. Conclusion

This 15-part runbook documents the complete lifecycle of deploying, securing, operating, troubleshooting, and maintaining an enterprise-grade observability platform on Google Kubernetes Engine.

It is intended to serve as:

- Deployment Guide
- Operations Manual
- Troubleshooting Handbook
- Disaster Recovery Guide
- Security Reference
- Onboarding Document
- Knowledge Base

Regularly review and update this document as the platform evolves.

---

# End of Runbook
