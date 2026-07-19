# Permissions

Product permissions are centralized in `@tablespro/permissions`.

Workspace roles:

- `owner`
- `admin`
- `editor`
- `commenter`
- `viewer`

Permission checks use explicit capabilities such as `workspace.read`, `base.create`, `table.manageSchema`, `record.update`, and `audit.read`. Backend code must call the permission layer for every protected operation. Frontend button hiding is only a user-experience hint.

Base and table overrides may assign a narrower role or explicit allow/deny permission lists. Denies win over allows.

Row-level permissions are not part of the first release. The extension path is to add a row-policy compiler that receives the authenticated subject, workspace role, table metadata, and record predicate, then appends a validated parameterized predicate to record queries.
