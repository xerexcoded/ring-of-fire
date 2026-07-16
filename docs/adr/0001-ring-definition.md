# ADR 0001: Treat Ring of Fire membership as versioned evidence

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Restless Pacific maintainers

## Context

“Ring of Fire” is memorable but scientifically imprecise. The Smithsonian
Global Volcanism Program (GVP) says it is a popular term and not a single,
connected geologic feature. Plate interactions around the Pacific include
separate subduction systems, transform boundaries, divergent boundaries, and
gaps. A map can accidentally turn an editorial outline into a claimed natural
boundary.

GVP version 5.3.6 is the project’s pinned acceptance fixture for the current
Pacific Ring of Fire (PROF) definition: 688 Holocene volcanoes in 41 regions.
Indonesia illustrates the ambiguity. It is commonly included in popular
descriptions, while most of it is outside this specific Smithsonian definition.

GVP does not publish a machine-readable PROF boolean or volcano-level download.
Its official 1,215-row Holocene catalog and the FAQ region table nominate 701
records; the FAQ geography and published per-region counts identify 13 explicit
exceptions, including the southern Izu Arc. The resulting 688 reviewed IDs are
therefore committed as a reproducible FAQ count-and-map reconstruction, not
misrepresented as a directly downloaded Smithsonian membership list.

## Decision

- Store `ring_membership` as a versioned relationship between a volcano, a
  named definition, and a source dataset version.
- Do not put a timeless `is_ring_of_fire` boolean on `volcano`.
- Model the broader six-chapter journey separately in `story_region`.
- Begin the journey in New Zealand and move clockwise, but label that order as
  an explicit narrative convention with no scientific start or end.
- Present Indonesia as a definition case study rather than silently including
  or excluding it.
- Fail a pinned-fixture refresh if the expected 688/41 acceptance counts move.
  An upstream version change requires a documented membership review.
- Pin the sorted volcano-number set and its SHA-256 fingerprint. Region names
  alone may nominate records for review but can never activate membership.
- For v5.3.6, the committed 688-line, LF-terminated ID file has SHA-256
  `efccd415cc6851623f20851af5abd872717e014486e2194453139ab78adf4525`.
- Retain the 13 explicit exclusions and their reasons beside the fixture so the
  reconstruction is inspectable and repeatable.

## Consequences

The interface can answer both “included according to which definition?” and
“shown in which chapter?” without conflating them. Historical views remain
reproducible after a source revision. Queries are slightly more verbose and a
source update requires human review, but the uncertainty becomes inspectable
rather than hidden.

## Alternatives considered

- A polygon around the Pacific was rejected because it implies a precise
  scientific boundary that the term does not possess.
- A permanent boolean on each volcano was rejected because it loses source,
  version, and definition context.
- Avoiding the term entirely was rejected because explaining its limits is the
  project’s editorial and educational hook.

## References

- [Smithsonian GVP: Which volcanoes constitute the Ring of Fire?](https://volcano.si.edu/faq/Pacific_Ring_of_Fire.cfm)
- [Smithsonian GVP web services](https://volcano.si.edu/database/webservices.cfm)
