# Frontend Rules

This is a tablet-first PWA for restaurant staff. Functional clarity over visual creativity.

## UI rules

- Minimum touch target: 48×48px
- Minimum body font: 16px — key actions 20px+
- Any screen reachable in 2 taps or fewer
- Design for 10–12" tablet in landscape orientation
- High contrast — readable in bright and dim environments
- No decorative complexity — clarity wins over creativity
- Animations only when communicating state change

## Component rules

- One component per file
- Co-locate styles, types, and tests with the component
- Use Tailwind utility classes only — no custom CSS unless unavoidable
- No inline styles

## Data fetching

- Use Supabase client for reads
- All writes go through the Action API — never write directly to the DB from the frontend
- Handle loading, error, and empty states for every data fetch

## Testing

- Playwright for E2E — cover the critical path of every feature
- Test on a 1280×800 viewport (standard tablet landscape)
