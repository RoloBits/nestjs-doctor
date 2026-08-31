---
"nestjs-doctor": patch
---

### Changed

- **Focused schema view keeps every table you open.** Selecting a second entity from the Relational Schema sidebar adds its related tables to the canvas instead of replacing the first; one table draws as a star, several draw with the overview layout. In the show-all view the highlight works the same way: every opened table's group stays lit instead of dimming when the next one is selected. Clicking a selected table removes its group, clicking empty canvas clears them all.
