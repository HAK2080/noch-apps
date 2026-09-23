# Weekly Supabase backup

The `Weekly Supabase backup` GitHub Action runs every Sunday at 04:00 Tripoli time and can also be started manually.

It exports every relation exposed by the Noch PostgREST API, Supabase Auth users, storage-bucket metadata, an API schema snapshot, and a manifest containing row counts and checksums. The archive is encrypted before upload and retained as a private GitHub Actions artifact for 35 days.

Required GitHub Actions secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BACKUP_PASSWORD`

To decrypt a downloaded artifact:

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in noch-supabase-backup.tar.gz.enc \
  -out noch-supabase-backup.tar.gz \
  -pass env:BACKUP_PASSWORD
tar -xzf noch-supabase-backup.tar.gz
```

The backup protects database records, including loyalty balances and ledgers. It does not copy Storage file contents or replace a full PostgreSQL schema dump. Source-controlled migrations plus `openapi.json` preserve the application/schema reference needed for recovery. Perform a restore rehearsal before relying on it as the only recovery method.
