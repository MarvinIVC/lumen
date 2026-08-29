# Study tools

Flashcards and the quiz (03-DESIGN.md §5). Shells — phase-08 adds scheduling, scoring and
persistence — but the interaction model is settled here and is the part that is easy to get wrong
later.

- **`Flashcard`** is a `<button aria-pressed>`, not a div with a click handler. Both faces stay in
  the DOM with the hidden one `aria-hidden`, so a screen reader user gets the same "look, then
  check" rhythm as everyone else instead of both sides read out at once. The 3D flip is 260ms
  (§7); under reduced motion the faces swap instantly.
- **`QuizRunner`** self-marks short answers on purpose. String-matching a chemistry answer
  punishes "35.45 u" against "35.45" and teaches students to write for the parser — so the
  explanation is revealed and they judge, which is closer to how they revise anyway.
- Multiple-choice rows tint on reveal, and the tint is never the only signal: the heading says
  "Right" or "Not quite" and carries an icon.
