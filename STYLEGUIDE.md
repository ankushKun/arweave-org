## Arweave.org Frontend Style Guide

### Global rules

- Do not use rounded corners anywhere in the UI.
  - Avoid Tailwind classes like `rounded`, `rounded-md`, `rounded-lg`, `rounded-full`, etc.
  - Prefer sharp, squared edges for inputs, cards, avatars, buttons, badges, and modals.

### Implementation tips

- Inputs/selects: omit any `rounded*` classes. Example: `class="border px-4 py-2"`.
- Avatars/logos: if a circle is desired visually, use bordered squares sized equally; do not use `rounded-full`.
- Badges/tags: use filled or bordered rectangles without radius.
- Components: if a component exposes a `rounded` prop or class list, set it to none or remove it.

This rule should be considered a hard constraint for this project unless the design team provides an explicit exception.


