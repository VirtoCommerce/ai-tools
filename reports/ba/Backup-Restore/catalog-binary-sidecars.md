# Catalog binaries in platform backups

Catalog images and file assets are no longer embedded in the backup JSON. They travel as separate
entries inside the backup archive, and the catalog JSON keeps only a reference to each one.

Delivered by [VCST-5387](https://virtocommerce.atlassian.net/browse/VCST-5387) across three components:
Platform (new contracts), Backup & Restore (archive ownership), Catalog (the module that uses them).

## Why it changed

Previously, when the **Binary** option was enabled, the Catalog module read every non-external image and
file fully into memory and the serializer wrote it into the JSON as base64. Memory therefore grew with
asset size and batch size, and base64 inflated the payload by roughly a third. Large catalogs risked
running out of memory during a backup.

Binaries are now streamed from blob storage straight into the archive, and back out again on restore, so
memory stays flat regardless of how large the assets are.

!!! note "The Binary option is not new"
    The **Binary** switch in the export and restore blades (`HandleBinaryData` in the API) existed before
    this change and behaves the same way from the operator's point of view: on means binaries are included,
    off means they are not. What changed is *how* they are carried when it is on — side-car entries instead
    of base64 inside the JSON. There is nothing new to turn on.

!!! success
    Measured on a test environment: five consecutive backups moved 900 MiB of incompressible assets while
    platform memory stayed at 559 MiB, with a peak excursion of 4 MiB. A restore streaming 180 MiB back
    moved the pod by 33 MiB, and that figure also covers writing 594 catalog entities to the database.

---

# For administrators

## What the backup looks like now

Create a backup as before — **Settings** → **Backup and restore** → select **VirtoCommerce.Catalog**,
enable **Binary** (labelled *Binary data*), and start the job. The archive you download now contains:

| Entry | Contents |
|---|---|
| `Manifest.json` | Platform backup manifest — modules, versions, flags |
| `VirtoCommerce.Catalog.json` | Catalog entities as readable JSON, with no base64 payloads |
| `assets/<original path>` | One entry per binary, keeping its original folder, file name and extension |

An asset stored at `catalog/products/image.jpeg` appears in the archive as
`assets/catalog/products/image.jpeg`. You can open the archive and inspect any image directly.

!!! tip
    Because the JSON no longer carries base64, it stays small and readable even for a large catalog — you
    can open `VirtoCommerce.Catalog.json` in an editor to inspect what was exported.

## What restore does

1. Open **Settings** → **Backup and restore**.
2. Pick the backup file, either by uploading it or by choosing one already in storage.
3. Enable **Binary**.
4. Start the restore and wait for the completion notification.

Each binary is written back to blob storage after its catalog entity has been saved, byte for byte.
Category, product and variation image and file associations are restored with it.

!!! note
    If two catalog objects point at the same asset URL, the archive holds that binary once and both
    objects reference it. On restore they both resolve to the same restored file.

## Things worth knowing

- **External images are left alone.** An image whose URL is an absolute address on another host is
  recorded as-is and never copied into the backup. Nothing fetches it during export.
- **A missing file does not fail the backup.** If a catalog record points at a file that is no longer in
  storage, the backup logs a warning, exports that entity without the binary, and finishes normally. The
  Catalog module is not reported as failed.
- **With Binary disabled**, the Catalog part stays plain JSON, no asset entries are written, and a restore
  does not touch blob storage.

!!! tip
    A backup that includes binaries can outgrow the server upload limit — typically 100 MB. If the file is
    too large to upload, pick a backup already present in storage instead of uploading one, or produce a
    smaller backup with **Binary** disabled. The blade surfaces this as an explicit upload-size message.

!!! warning
    Restoring the Catalog module replaces catalog data from the backup. Anything created after the backup
    was taken may be reverted. Take a fresh backup before restoring an older one.

## Older backups still work

Backups produced before this change restore normally — including ones whose JSON carries inline base64
binaries. You do not need to re-take existing backups.

---

# For developers

## The contracts

Platform gained four optional interfaces in `VirtoCommerce.Platform.Core.ExportImport`. The existing
`IExportSupport` and `IImportSupport` are unchanged, so modules that do not implement the new ones keep
working exactly as before.

| Interface | Implemented by | Purpose |
|---|---|---|
| `IExportBinaryDataSupport` | a module | Declares that the module exports a readable primary payload plus binary side-cars |
| `IImportBinaryDataSupport` | a module | Declares that the module can consume that shape on import |
| `IExportBinaryDataWriter` | the backup owner | Gives the module streaming write access to one archive entry |
| `IImportBinaryDataReader` | the backup owner | Gives the module streaming read access to one archive entry |

The writer and reader abstractions exist so the module never touches the backup's raw archive stream — it
asks for one entry at a time by reference.

Backup & Restore continues to own the outer archive and supplies the module with implementations of the
writer and reader. It buffers only the module's JSON payload to a temporary `DeleteOnClose` file when a
seekable payload is needed; asset binaries are never accumulated in managed memory.

## Reference format

A reference is a relative path inside the archive:

```
assets/catalog/products/image.jpeg
```

Validation is strict, and applies on both write and read:

- must start with `assets/`
- must not contain a backslash
- must have a non-empty relative part
- no path segment may be empty, `.`, or `..`
- no segment may contain control characters

Validation runs against the **decoded** value, so a percent-encoded traversal such as
`assets/a%2F..%2F..%2Fsecret.zip` is rejected too. A reference is also checked against the destination
blob URL before any data is written.

!!! warning
    An invalid reference is rejected before any binary is written. Nothing is created outside the asset
    root, and the restore reports the offending reference by name.

## Catalog module specifics

`AssetBase` gained a `BinaryDataReference` property. It is **transient** — populated only while a backup
is being written or read, never persisted, and omitted from JSON when null.

When `HandleBinaryData` is enabled *and* the orchestrator supports binary side-cars, the Catalog module:

- keeps `VirtoCommerce.Catalog.json` as readable JSON with no inline base64,
- writes each category, product and variation image or file as a top-level `assets/<source path>` entry,
- reuses one entry when several objects share a source URL,
- leaves absolute external URLs untouched,
- logs a warning and continues when a referenced file cannot be read.

## Supported input formats on import

Import detects the shape it is given, so three historical layouts still load:

1. **Current** — outer archive with a readable `VirtoCommerce.Catalog.json` and top-level `assets/` entries.
2. **Nested package** — the Catalog part is itself an archive containing `package.json`, `catalog.json` and
   `assets/`. Two reference styles are accepted: readable source paths, and the earlier
   `assets/<sha256-of-source-url>.bin` naming.
3. **Legacy JSON** — a plain Catalog JSON with inline base64 `binaryData`.

!!! note
    Entries inside a nested package must be **stored, not compressed** — the reader requires
    `CompressedLength == Length` and rejects the package otherwise. This is an abuse guard, alongside
    limits on manifest size, entry count and total uncompressed length.

## Opting a module in

Implement `IExportBinaryDataSupport` / `IImportBinaryDataSupport` alongside your existing export/import
support, and use the writer and reader the orchestrator passes you rather than reaching for the archive
yourself. A module that does not implement them is called through the legacy single-stream contract and
its part is written as before — verified with the Pricing module, whose backup entry and restore behaviour
are unchanged.

---

## Not documented here

- Screenshots of the **Backup and restore** blade. The verification for this story was API-driven, so no
  Admin SPA captures were taken. House style requires real captures rather than placeholders — they should
  be added before this is published.
- The precise memory figures above come from one measured environment and are illustrative, not a
  performance guarantee.
