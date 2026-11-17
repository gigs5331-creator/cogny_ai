# Cogni admin dashboard

## Goal
Create a private, classic admin dashboard inspired by the supplied reference, tailored to Cogni and powered by live app data.

## What will be built
- Add a protected `/admin` page available only to `tinotendas255@gmail.com` through a secure admin role.
- Add an Admin navigation item that appears only for authorized admins.
- Show key totals and recent growth: students, new signups, decks, flashcards, questions answered, and correct answers.
- Show useful academic insights: most common faculties/programs, universities, account types, popular subjects, recent signups, recent decks, and recent study activity.
- Use compact dark navy panels, cyan highlights, charts, ranked lists, and responsive tables based on the reference image while keeping Cogni’s visual identity.
- Include clear loading, empty, and access-denied states for desktop and mobile.

## Security
- Store admin access in a dedicated role table, never in profiles or browser storage.
- Enforce access on the server before reading platform-wide statistics.
- Grant the named account the admin role without exposing other users’ private details to normal accounts.

## Technical details
- Add a database role enum/table, `has_role` security function, strict row-level access rules, and an admin assignment for the supplied email.
- Add an authenticated server function that verifies the admin role, then returns aggregated dashboard statistics and limited recent activity.
- Build charts with the existing chart library and reuse Cogni’s design tokens and button/navigation components.
- Add route metadata and verify the page at desktop and 360px mobile widths with no overflow.
