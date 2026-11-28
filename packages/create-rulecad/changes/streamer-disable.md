---
title: the drivers stay on until the last move has run
bump: patch
---
### Fixed

- The arm and leg templates' streamer (`firmware/arm/arm.ino`, `firmware/leg/leg.ino`) and sender (`send.mjs`) keep the
  motor drivers on until the last move has run. The streamer answers a move as soon as it is queued, and the sender used
  to send `d` (drivers off) straight after the last answer, which the streamer obeyed at once: the last moves ran with
  the motors slack, so a short job never moved, the arm lost the end of its last stroke and the leg dropped instead of
  coming back to its pose. Now the streamer's `d` waits, like `h`, until everything queued has run, and the sender asks
  the board where it is (`?`) until nothing is queued and nothing moves before it sends `d`.
- Upgrading: copy the new `send.mjs` and firmware into your project and reflash every board already loaded with the
  streamer. A board left on the old firmware is kept safe by the new sender alone. A job's last answer now comes when
  the machine has stopped, so `send.mjs` finishes a few seconds later than before. No printed size moves.
