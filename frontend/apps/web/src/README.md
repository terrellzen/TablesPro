# Frontend structure

- `main.tsx` initializes global styles/theme, composes the application controller and view, and mounts React.
- `features/app/useAppController.ts` coordinates authenticated state and domain use cases.
- `features/app/AppView.tsx` renders top-level application states and workspace composition.
- `components/` contains reusable, domain-light UI controls and overlays.
- `features/` groups UI and hooks by product capability (`auth`, `grid`, `admin`, `workspace`).
- `lib/` contains infrastructure and side-effect boundaries such as HTTP, theme persistence, and value conversion.
- `types/` contains the shared frontend domain model.
- `styles/` separates tokens, base layout, feature styles, overlays/responsive behavior, and final product polish.

Feature modules may depend on `components`, `lib`, and `types`. Shared layers should not import feature modules, except for a type-only contract when unavoidable. Network calls belong in `lib` or feature hooks; reusable components should remain unaware of API endpoints.
