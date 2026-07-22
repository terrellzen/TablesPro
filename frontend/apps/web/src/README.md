# Frontend structure

- `main.tsx` initializes global styles/theme, composes the application controller and view, and mounts React.
- `features/app/useAppController.ts` composes shared state, loading, effects, and the controller API consumed by the view.
- `features/app/actions/` groups mutations by domain (workspace, base, table, field, view, record, admin, and session).
- Large app and admin views are composed from focused sibling components rather than growing a single page component.
- `features/app/AppView.tsx` renders top-level application states and workspace composition.
- `components/` contains reusable, domain-light UI controls and overlays.
- `features/` groups UI and hooks by product capability (`auth`, `grid`, `admin`, `members`, `workspace`).
- `lib/` contains infrastructure and side-effect boundaries such as HTTP, theme persistence, and value conversion.
- `types/` contains the shared frontend domain model.
- `styles/` separates tokens, app/workspace layout, admin features, overlays/responsive behavior, and final product polish.
- `../../../tests/` contains frontend tests grouped by feature or library area and has its own TypeScript project.

Feature modules may depend on `components`, `lib`, and `types`. Shared layers should not import feature modules, except for a type-only contract when unavoidable. Network calls belong in `lib` or feature hooks; reusable components should remain unaware of API endpoints.

Workspace members are opened from a workspace's sidebar context menu. The member editor keeps permission inheritance and access-summary logic in `features/members/permissionModel.ts`, separate from rendering and API mutations.
