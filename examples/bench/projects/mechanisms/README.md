# Mechanisms printed flat

Small mechanisms printed in one piece, on their side, each checked as it would behave: its flexures as beams that bend
as far as they bend, its parts touching, a hand driving it through its sequence (`@rulecad/flexures` lamina). They test
the system on the way to the disc launcher.

- **`key`: a key with a tactile click.** A stem on a tapered two-leaf guide; a bump on its side rides past a bump on a
  rounded click leaf. Its force rises to 1.48 N, then falls 29% as the bumps pass: the click. Every flexure stays
  within its strain limit, with its real peak checked by finite elements, and is stopped by the frame before it
  breaks. `npx cad check mechanisms/key`, `npx cad animate mechanisms/key`.
- **`latch`: a push-push latch, not working yet.** A pin hangs from a plunger on a soft leaf and runs round a
  heart-shaped track. Press once and it should hold; press again and it should come home. It doesn't hold yet. A heart
  track is a loop the pin runs all the way round, so the heart in the middle can't join the frame anywhere in the plane:
  in one flat layer it prints loose. Real push-push latches cut the track as a groove, with the heart held by the
  groove's floor. Lamina needs parts at different heights (a floor under the track, the pin riding above it) before
  this one can work.
