# Security

- Keep PocketBase off the public Internet when a server-side frontend is the gateway. Bind the host port to loopback and use a private container network.
- Use separate application users and `_superusers`. Restrict superuser access by IP where practical, enable MFA, and keep a dedicated recovery account in a password manager.
- Enable PocketBase rate limits and configure trusted proxy headers deliberately. The reverse proxy must overwrite, not append blindly to, client IP headers.
- Keep collection rules least-privileged. Owner scope belongs in rules or the database query. Never accept an owner/session identifier from a body without tying it to authenticated context.
- Validate file MIME types, sizes, names, and authorization. Treat uploaded files and JSON fields as untrusted.
- Use `--encryptionEnv=PB_ENCRYPTION_KEY` with an independent 32-character secret. Backups require that key to recover encrypted settings.
- Never expose raw errors in production or put credentials in Git, docs, shell history, frontend bundles, logs, or chat.
