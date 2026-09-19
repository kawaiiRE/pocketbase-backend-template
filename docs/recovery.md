# Backup and recovery

PocketBase data and local uploads live together in `pb_data`. Do not copy this directory while PocketBase is running. Use the built-in backup API for a consistent ZIP, or stop the instance before an offline copy. If files use external S3 storage, register and verify a separate object export; a database archive alone is incomplete.

Production requires independent encrypted copies on the server, in cloud storage, and on the laptop. Each application has its own keys and repository. A scheduled upload is not a verified backup.

To verify recovery:

1. Download and verify the archive checksum.
2. Restore into a new isolated directory, never over the running application.
3. Use the same PocketBase version and recovered settings-encryption key. Do not apply newer migrations during verification.
4. Run SQLite integrity checks, start the isolated instance on an unused loopback port, and verify collections, representative records, files, and recovery-account authentication.
5. Record the source revision, PocketBase version, archive checksum, test result, and time.
6. Switch traffic only after the isolated restore passes and the intended release migration plan is reviewed.

Keep recovery passwords outside the archives in a password manager. Test server/cloud and laptop restore paths regularly.
