import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDecks from "./tools/list-decks";
import getDeckCards from "./tools/get-deck-cards";
import createDeck from "./tools/create-deck";
import searchSharedDecks from "./tools/search-shared-decks";
import getStudyProgress from "./tools/get-study-progress";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "ai-study-buddy",
  title: "AI Study Buddy",
  version: "0.1.0",
  instructions:
    "Tools for Cogni, an AI flashcard and quiz app for students. Use `list_decks` and `get_deck_cards` to read the student's decks, `create_deck` to add a new deck of flashcards, `search_shared_decks` to find decks shared by classmates in the same program, and `get_study_progress` for their answered/correct totals.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listDecks, getDeckCards, createDeck, searchSharedDecks, getStudyProgress],
});
