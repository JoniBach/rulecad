# Code in @rulecad/topopt that follows someone else's

Most of `@rulecad/topopt` is rulecad's own work, under the MIT licence in [LICENSE](LICENSE). One part is not.

## The method of moving asymptotes: `mma`, `subsolve` and `gauss` in topopt.mjs

The method of moving asymptotes (MMA) is the step `optimise` takes for stress limits, mechanisms and vents, and it is
exported as `mma`. Three functions in `topopt.mjs` carry it out: `mma`, its subproblem solver `subsolve`, and the small
linear solver `gauss` that `subsolve` calls. They were written by following Krister Svanberg's MATLAB code closely,
not only his papers:

- `mmasub.m` (September 2007, revised August 2008), which `mma` follows;
- `subsolv.m` (December 2006), which `subsolve` and `gauss` follow.

That code is Copyright (C) 2006-2009 Krister Svanberg, and he releases it under the GNU General Public License,
version 3 or (at your option) any later version (GPL-3.0-or-later). It is offered at https://www.smoptit.se, in
GCMMA-MMA-code-1.5.zip, whose COPYRIGHT file and file headers give these terms.

What this means for you: the rest of the package is MIT, but these three functions follow GPL code closely enough that
they may count as a translation of it. If you copy or reuse them, or ship `topopt.mjs` as part of your own work, treat
them as possibly under the GPL as well, until they are replaced.

## What is being done

The three functions are being rewritten from Svanberg's published description of the method alone (Svanberg 1987, in
the *International Journal for Numerical Methods in Engineering* 24, 359-373, and his 2007 notes "MMA and GCMMA, two
methods for nonlinear optimization"), without the MATLAB code to hand
([issue #348](https://github.com/JoniBach/rulecad/issues/348)). Once the rewrite is released, this note
will say which version of the package is free of the GPL code, and the section above will go.
