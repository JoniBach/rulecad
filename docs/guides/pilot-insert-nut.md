# Choosing a pilot, an insert or a nut

A screw that holds two printed parts together needs something to grip at its far end. In a printed part there are three
usual choices: a pilot, a heat-set insert, or a nut. This guide says what each is, when to use it, and how rulecad draws
and checks it. The figures are for an M3 screw in PLA; other sizes follow the same reasoning, with their own figures in
`@rulecad/rules`.

## The three, in one line each

- **A pilot** is a hole a little smaller than the screw. The screw cuts its own thread in the plastic as it goes in.
- **A heat-set insert** is a short brass sleeve, threaded inside and knurled outside. A soldering iron melts it into a
  hole, and the screw then turns in brass.
- **A nut** is a steel nut held in a pocket or a slot in the part, so the screw turns in steel and the part only stops
  the nut from turning.

## Side by side

| | Pilot | Heat-set insert | Nut |
|---|---|---|---|
| Extra part to buy | None | An insert for each screw | A nut for each screw |
| Tool | A hex key | A soldering iron, once, then a hex key | A hex key |
| Thread the screw turns in | Plastic | Brass | Steel |
| Taken apart and put back | A few times: the plastic thread wears each time | Often | Often |
| Room it needs (M3) | A 2.9 mm hole 5 mm deep or more | A 4 mm hole 6.7 mm deep, 1.6 mm of wall round it | A pocket or slot 5.5 mm across the flats and 2.4 mm along the screw, plus clearance |
| What fails first under a pull | The plastic thread strips | The insert pulls out of the plastic | The screw, or the plastic under the nut |
| Printing | A plain hole | A plain hole, often in a boss | A pocket or a slot, shaped so it prints |

The M3 figures come from the rule sets the kit draws with: the pilot from Bambu Lab's guide for PLA (`m3.pilot`, 2.9 mm,
and `m3.pilot_depth`, 5 mm), and on the X1C from a measured fit bar (`x1c.pilot_m3`, also 2.9 mm); the insert from CNC
Kitchen's sheet for its M3 x 5.7 insert (`m3.insert_hole`, `m3.insert_depth` and `m3.insert_wall`); the nut from ISO
4032 (`m3.nut_flats` and `m3.nut_height`). Each source is listed at the end.

## When to use which

1. **Start with a pilot.** It costs nothing, needs no tool and no extra part, and is enough for a part that is put
   together once, or opened a few times. Give it a little more than the 5 mm of thread it asks, and a floor under it.
2. **Use an insert where the screw comes out often**, or where a thread worn in plastic would matter: a lid, a battery
   door, a part you adjust. An insert also gives the same thread every time, whatever the plastic. It needs a wall round
   it and room for its depth, which is what an insert boss is for.
3. **Use a nut where the joint carries the most**, or where the plastic is thin. The thread is steel, so the plastic only
   has to hold the nut still and take the pressure under it. It needs room for the nut, and either a way in from the
   far side or a slot the nut slides into from the side.

Mixing them is fine: one part can take inserts where it is opened and pilots where it is not.

## How rulecad draws each

Each comes from `v.fixings` in a design, named by its thread, so the size is never a typed number:

- a pilot: `v.fixings.hole('M3', { kind: 'pilot', at })`;
- an insert: `v.fixings.hole('M3', { kind: 'insert', at })`, or `v.fixings.insertBoss('M3', { at })` for the boss and
  its hole together;
- a nut: `v.fixings.nutPocket('M3', { at })` for a pocket in from a face, along the screw, or
  `v.fixings.nutTrap('M3', { depth, at })` for a slot the nut slides into from the side, across the screw.

Each is shaped to print without supports in the direction it is drawn for, and says so when the design is checked.
A nut's slot cut across a screw that stands up has a bridged roof, so bring the screw in through the slot's floor, or
lay the screw on its side and drop the nut in from the top.

In an assembly, a `fasten` relation names the screw and the parts it joins. The check finds the far end in the part as
drawn and says which of the three it is, chooses the shortest screw that is sold and fits, and checks the thread it
engages, the seat under its head, the hex key's way to it, and, where the assembly has a load, the margin on the
screw and the thread. [Examples chapter 15](https://github.com/JoniBach/rulecad/blob/main/packages/cad/EXAMPLES.md)
is a shelf bracket that uses all three, with the check read out.

## Measure them on your printer

A pilot that is right on one printer and plastic can split a part or strip on another. The fixings coupon,
`examples/bench/projects/benchmarks/objects/fixings-coupon`, prints pilots at five sizes, insert holes and nut pockets
and slots at three fits each. Print it, judge each row as `MEASURE.md` says, and write the result back with
`cad measured benchmarks/fixings-test <rule>=<figure>`. Every design drawn with `v.fixings` then follows it.

## Sources

- Bambu Lab, [How to design screw holes for 3D printing](https://forum.bambulab.com/t/how-to-design-screw-holes-for-3d-printing/217352):
  the M3 pilot and the length of thread it should engage in PLA.
- CNC Kitchen, [heat-set insert dimensions and design guidelines](https://www.cnckitchen.com/s/CNCKitchen_Heat-Set-Insert-Dimensions-and-Design-Guidelines.pdf):
  the insert's hole, depth, length and least wall.
- ISO 4032, hexagon nuts, as tabulated at [fasteners.eu](https://www.fasteners.eu/standards/ISO/4032/): the nut's width
  across the flats and its height.
- `examples/bench/projects/benchmarks/MEASURE.md`, row 5: the X1C's measured M3 pilot.

All were read on 2026-11-15. Each figure's rule, with its kind and its source, is in `packages/rules` (`m3.json` and
`x1c.json`).
