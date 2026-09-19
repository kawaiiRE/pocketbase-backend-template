# Deployment

Deploy each application in its own wrapper, for example `/var/www/<project>/backend`, with a project-owned Compose file and runtime directory one level above. RachVision-owned templates can remain under the established RachVision server root. Client applications belong under the separately restricted client root. They must not share volumes, credentials, networks, auth cookies, backup repositories, or Compose project names.

Copy `compose.example.yml` to the project wrapper and adapt paths and limits. Bind PocketBase to an assigned loopback port or private container network. Put Caddy or another reverse proxy in front only where the application contract requires it. Administration should use an SSH tunnel.

`docker.sh` refuses dirty checkouts and non-fast-forward pulls. If migrations changed, it requires either an explicitly declared first install or a non-empty valid PocketBase backup ZIP. PocketBase applies pending migrations at startup even when automatic migration generation is disabled. Keep the previous image and matching data snapshot for rollback.

After release, verify the health route, migration state, representative records and files, authentication, the public application path, backup coverage, and unrelated applications on the host.
