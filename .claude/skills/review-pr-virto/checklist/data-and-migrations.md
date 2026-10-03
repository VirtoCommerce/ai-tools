# Data and migrations

- **Any schema change ⇒ migrations for every provider the repository ships** (SqlServer, PostgreSql,
  MySql where present), plus updated model snapshots. A single-provider migration is a **blocker**.
- Migration content: data loss on column drops or renames, defaults for new non-nullable columns,
  indexes for new query paths.
- Entity ↔ model mapping updated in `ToModel` **and** `FromModel` (and `Patch`): a one-sided mapping
  silently zero-defaults the field on the round trip.
