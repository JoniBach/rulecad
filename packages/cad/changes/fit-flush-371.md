---
title: 'no parts overlap' catches parts that overlap on a shared plane, without manifold-3d
bump: patch
---
### Fixed

- In a workspace without `manifold-3d` (a new workspace's default), the overlap check threw away the volume JSCAD measured whenever `@rulecad/fit` said the parts' surfaces did not cross. Parts of the same height standing on one plane and run into each other, or a part placed twice, share face planes, and fit read them as touching: 'no parts overlap' passed two 10 mm cubes sharing 250 mm³. fit now finds these overlaps, so the check fails them with the volume measured. If you upgrade, an assembly with parts like these that passed now fails 'no parts overlap', naming the two parts and how much they share. Remembered overlaps (`.cache/overlaps.json`) are measured again once. No printed size changes.
