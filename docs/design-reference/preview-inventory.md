# Sofra design-preview inventory

Source audited: the complete 4278×8361 design board currently stored at
`docs/design-refrence/Sofra — App Design.png`. The directory name in the
working tree is misspelled; this audit does not rename the user-supplied file.

“Existing” means that a dedicated `/design-preview` route currently renders a
recognizable implementation of the screen purpose. It does not claim exact
pixel fidelity for board variants that have not been implemented separately.

| Section | Screen purpose | Variant | Proposed route | Existing | Assets required | Resolution sufficient? |
|---|---|---|---|---|---|---|
| SIGN UP + CODE | Phone-number entry | Light | `/design-preview/signup?theme=light` | Yes, dark treatment only | None beyond typography | Yes for layout; small footer copy is only partially legible |
| SIGN UP + CODE | Verification-code entry | Light | `/design-preview/code?theme=light` | No | None beyond typography | Yes for composition; secondary copy needs confirmation |
| SIGN UP + CODE | Phone-number entry | Dark | `/design-preview/signup?theme=dark` | Yes | None beyond typography | Yes |
| SIGN UP + CODE | Verification-code entry | Dark | `/design-preview/code?theme=dark` | No | None beyond typography | Yes for composition; secondary copy needs confirmation |
| NAME | Name entry with red line-art plate | Light | `/design-preview/name?variant=outline` | No | Isolated line-art plate | Yes, but export/crop from original artwork is preferable |
| NAME | Name entry with red scalloped plate | Light | `/design-preview/name?variant=scalloped` | No | Isolated scalloped plate | Yes, but export/crop from original artwork is preferable |
| NAME | Name entry with vintage photographic plate | Light | `/design-preview/name?variant=vintage` | Partially; current route uses a separate silver plate asset | Exact vintage plate | Yes for placement; source plate should be exported separately |
| NAME | Name entry with photographic plate on burgundy card | Dark | `/design-preview/name?variant=dark` | Partially; structure exists, exact variant does not | Exact cream plate | Yes for layout; isolated plate remains preferable |
| DASHBOARD | Invitation/event detail with date, place, dress code, guests, and RSVP prompt | Dark shell with light card | `/design-preview/events/demo?state=summary` | No | Lace header and invitation-card treatment | Yes for layout; small metadata needs confirmation |
| DASHBOARD | Profile and table-history dashboard | Light | `/design-preview/events?theme=light` | Yes, local dashboard structure; exact artwork remains unavailable | Avatar placeholder, event-card art, lace artwork | Yes |
| DASHBOARD | Profile and table-history dashboard | Dark | `/design-preview/events?theme=dark` | Partially; shared dashboard exists, separate dark query state is not implemented | Avatar placeholder, event-card art, lace artwork | Yes |
| DASHBOARD | Declined/maybe RSVP empty state | Light | `/design-preview/events/demo?state=maybe` | No | Handwritten labels/card outline | Yes |
| DASHBOARD | Compact event invitation summary | Light | `/design-preview/events/demo?state=compact` | Partially; summary content is integrated into the detail preview | Invitation paper texture | Yes |
| DASHBOARD | Expanded event details with menu/guests/details accordions | Light | `/design-preview/events/demo?state=expanded` | Yes | Icons and paper texture | Yes for structure; body copy is small |
| DASHBOARD | RSVP response-card selection | Dark | `/design-preview/events/demo?state=rsvp` | Yes, as local state below event details | Three perforated response cards | Yes |
| PREFERENCES | Guest preference receipt | Dark outer canvas, tan receipt | `/design-preview/preferences` | Yes | Existing perforation/divider assets | Yes; older drink copy is intentionally not authoritative for current survey values |
| PREFERENCES | Host-a-Sofra event setup form | Light | `/design-preview/customization?step=event` | No | Cover texture and theme swatches | Yes for layout; field copy is small |
| PREFERENCES | Drafted menu cover/preview | Light | `/design-preview/menu?state=drafted` | No | Ornate menu artwork | Yes for placement; exact artwork needs an isolated asset |
| INVITE | Lace-paper invitation template | Light | `/design-preview/invite?template=lace` | Yes with an explicitly marked Arabesque placeholder | Lace invitation artwork | Yes; isolated artwork required |
| INVITE | Silver place-setting invitation template | Light | `/design-preview/invite?template=place-setting` | No | Plate, cutlery, and printed-card composition | Yes; isolated artwork required |
| INVITE | Polka-dot envelope invitation template | Light | `/design-preview/invite?template=polka-dot` | No | Envelope artwork | Yes; isolated artwork required |
| INVITE | Burgundy open-envelope invitation template | Dark | `/design-preview/invite?template=burgundy-envelope` | No | Open-envelope artwork | Yes; isolated artwork required |
| CUSTOMIZATION | Thank-you-card introduction | Light | `/design-preview/customization?step=thanks` | No | Thank-you card artwork | Yes for composition; small card copy is not fully legible |
| CUSTOMIZATION | Thank-you-card template picker | Light | `/design-preview/invite/templates?kind=thanks` | No | Four thank-you template thumbnails | Yes for selection layout; originals required for faithful cards |
| CUSTOMIZATION | Menu-template picker | Light | `/design-preview/invite/templates?kind=menu&theme=light` | No | Four menu template artworks | Yes; originals required |
| CUSTOMIZATION | Menu-template picker | Dark | `/design-preview/invite/templates?kind=menu&theme=dark` | No | Same menu artworks plus dark selected state | Yes; originals required |
| LIGHT APPLICATION COLLECTION | Home/welcome storefront | Light | `/design-preview/welcome?collection=app&theme=light` | Partially; onboarding welcome exists, full storefront does not | Ornate frame and background illustration | Yes |
| LIGHT APPLICATION COLLECTION | Upcoming dinner detail | Light | `/design-preview/events/demo?collection=app&theme=light` | No | Wooden-door photograph and guest avatars | Yes |
| LIGHT APPLICATION COLLECTION | Kitchen/menu highlights | Light | `/design-preview/menu?theme=light` | Yes with labeled photo placeholders | Four food photographs | Yes |
| LIGHT APPLICATION COLLECTION | Table dietary summary | Light | `/design-preview/events/demo?panel=table&theme=light` | No | Restriction icons | Yes |
| LIGHT APPLICATION COLLECTION | Profile and table history | Light | `/design-preview/profile?theme=light` | Yes | Event-history icons/avatar treatment | Yes |
| DARK APPLICATION COLLECTION | Home/welcome storefront | Dark | `/design-preview/welcome?collection=app&theme=dark` | Partially; onboarding welcome exists, full storefront does not | Ornate frame and background illustration | Yes |
| DARK APPLICATION COLLECTION | Upcoming dinner detail | Dark | `/design-preview/events/demo?collection=app&theme=dark` | No | Wooden-door photograph and guest avatars | Yes |
| DARK APPLICATION COLLECTION | Curated menu highlights | Dark | `/design-preview/menu?theme=dark` | Yes with labeled photo placeholders | Four food photographs | Yes |
| DARK APPLICATION COLLECTION | Table dietary summary | Dark | `/design-preview/events/demo?panel=table&theme=dark` | No | Restriction icons | Yes |
| DARK APPLICATION COLLECTION | Profile and table history | Dark | `/design-preview/profile?theme=dark` | Yes through the profile appearance control | Event-history icons/avatar treatment | Yes |

## Implementation boundary

The gallery index exists to expose the four implemented routes and document
the eight planned destinations. Planned links are deliberately non-interactive
and marked `aria-disabled`; no missing route is presented as finished.

Before implementing the next section, extract original artwork where the table
marks an asset requirement. The board resolution is adequate for layout,
spacing, palette, and most typography, but embedded decorative art and very
small copy should not be recreated from guesses.
