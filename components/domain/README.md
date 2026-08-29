# Domain components

Product-specific components — the parts of Lumen that only make sense inside Lumen. See
`../README.md` for the system as a whole and for the rules everything here follows.

Most of these are shells: the layout, the copy and the states are finished, and the data arrives in
a later phase.

| Component | Wired up in |
|---|---|
| `FileDropzone`, `ExtractionEditor` | phase-03 (ingestion) |
| `ContextCard`, `OptionsPanel` | phase-04 (the AI engine) |
| `StreamingDoc` | phase-05 (the note workspace) |
| `NoteCard`, `LibraryTree`, `SubjectPicker`, `QuotaMeter`, `BYOKForm` | phase-06 (auth and library) |
| `ExportMenu`, `ShareDialog`, `IntegrationButton` | phase-07 (integrations and export) |
| `CostDashboard` | phase-10 (admin) |

"Shell" means the data is missing, not that the thinking is. The states worth reading the code for:

- `ContextCard` changes its tone below 0.6 confidence — it asks instead of asserting, because a
  wrong course silently chosen produces a study guide aimed at the wrong exam.
- `IntegrationButton` treats an expired token as a state rather than an error: the note is fine,
  only the connection is not.
- `BYOKForm` never renders a stored key back into the input — not masked, not partial.
- `CostDashboard` gives the monthly figure the larger number, because the monthly cap is the real
  ceiling; reading the daily cap as the limit is how you throttle students during exam week.
- `QuotaMeter` leads with what is left, not what is spent.
