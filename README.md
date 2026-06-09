# templates

Copy-and-customize boilerplate — IaC, Dockerfiles, compose files, and manifests you clone into a project and edit, carved out of the former `devops` repo.

For standalone scripts you run as-is, see [`utils`](https://github.com/rwaterman/utils).

## Layout

- `aws/cloudformation/` — VPC stack (`vpc.yml`, `vpc.parameters.example.json`) plus its companion `vpc_create.sh` / `remove_stack.sh` deploy helpers, and `prod-security-groups.yml`. The deploy script uses relative `file://vpc.yml`, so keep these together. Copy `vpc.parameters.example.json` to `vpc.parameters.json` and edit before deploying.
- `aws/docker/amazon-linux/` — Amazon Linux `docker-compose.yml`.
- `docker/ubuntu-latest/` — Ubuntu `Dockerfile` + `docker-compose.yml` (see its `README.md`).
- `grafana/` — Grafana `docker-compose.yml`.
- `k3s/` — example nginx Deployment + Service manifests.
- `nodejs/benchmark/` — minimal Node.js benchmark scaffold to copy and adapt.

## Convention

Anything you copy and then edit belongs here. A script that performs an action on its own belongs in `utils`.
