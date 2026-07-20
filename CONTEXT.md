# Ark Control

The Ark control context coordinates cloud hosts and automated APK delivery.

## Language

**APK Delivery**:
The ongoing capability that detects APK Releases and coordinates their Deployments through terminal Host Run results.
_Avoid_: Watcher

**Deployment**:
The rollout of one APK Release to every VPS Host that is enabled when the rollout begins. It contains one Host Run per targeted VPS Host.
_Avoid_: Pipeline, batch

**Host Run**:
The independent execution of a Deployment's Helper on one VPS Host, observed from start until it reaches a terminal result. One Host Run can fail or finish without blocking the Host Runs for other VPS Hosts.
_Avoid_: deployment, task
