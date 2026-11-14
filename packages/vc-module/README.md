# vc-module

Path-scoped AI coding rules for VirtoCommerce platform modules, packaged for [APM](https://github.com/microsoft/apm). Claude Code loads a rule only while it works on a file the rule's `paths:` match.

## Install

```bash
apm install VirtoCommerce/ai-tools/packages/vc-module#vc-module--v<version> --target claude
```

- Pin the literal tag `vc-module--v<version>`. `ai-tools` also carries other packages' tags and legacy `v*` tags, so a version range can resolve to the wrong one.
- Commit `apm.yml`, `apm.lock.yaml` and `.claude/rules/vc-*.md`. APM adds `apm_modules/` to `.gitignore`.
- Run `apm install` only. While `.claude/rules/` holds the rules, `apm compile --target claude` writes nothing. With `--force-instructions` it also copies them into per-folder `CLAUDE.md` files, so Claude reads each rule twice.

## What it writes

| Rule | Loaded for |
|------|------------|
| `vc-backend-core-models.md` | `src/*.Core/Models/**/*.cs`, `src/*.Core/Extensions/**/*.cs` |
| `vc-backend-data-models.md` | `src/*.Data/Models/**/*.cs` |
| `vc-backend-data.md` | `src/*.Data/Models/**/*.cs`, `src/*.Data/Repositories/**/*.cs`, `src/*.Data.SqlServer/**/*.cs`, `src/*.Data.MySql/**/*.cs`, `src/*.Data.PostgreSql/**/*.cs`, `src/*.Web/Module.cs` |
| `vc-backend-lifecycle.md` | `src/*.Web/Module.cs` |
| `vc-backend-manifest.md` | `src/*.Web/module.manifest`, `src/**/*.csproj`, `Directory.Build.props` |
| `vc-backend-permissions-settings.md` | `src/*.Core/ModuleConstants.cs`, `src/*.Web/Localizations/*.json` |
| `vc-backend-rest-api.md` | `src/*.Web/Controllers/**/*.cs` |
| `vc-backend-services.md` | `src/*.Data/Services/**/*.cs` |
| `vc-backend-shared.md` | `src/**/*.cs`, `src/**/*.csproj`, `tests/**`, `Directory.Build.props`, `.editorconfig` |
| `vc-backend-tests.md` | `tests/**` |
| `vc-backend-validation.md` | `src/*.Data/Validation/**/*.cs` |

Every rule is path-scoped: the package ships no rule that loads for every file, and no `CLAUDE.md` or `AGENTS.md`.

## Next to your own rules

- **`vc-` is the package's prefix.** APM rewrites `.claude/rules/vc-*.md` on every install and deletes a rule the package drops. Don't edit them; name your own rules without the prefix, and APM leaves them alone.
- **Your values stay yours.** The rules write `<ModuleName>`, `<ModelName>`, `<table-prefix>`, `<permission-prefix>` and `<route-prefix>`. Set the module's values in its own rules or `CLAUDE.md`, along with its own build gate.
- **Backend only.** The rules cover the regular module layers: Core, Data, the per-provider Data projects, Web and tests. They don't cover xAPI modules (`vc-module-x-*`) or a vc-shell app.

## Rule IDs and scopes

Each rule item starts with `<id> · <scope>`, for example `` `D02 · platform` ``.

| Scope | Meaning |
|-------|---------|
| `platform` | What VirtoCommerce modules already do, written down |
| `stricter` | Deliberately stricter than the platform, meant for every module |

An ID names one rule for good: a retired ID is never reused.
