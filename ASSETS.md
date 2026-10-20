# Image sources

The original `logo.jpeg` and `example_image1.jpeg` from the user's
`public/images/` are preserved. Both show the same outdoor sign. The site uses
`static/brand.svg`, an original simplified figure and a serif wordmark inspired
by that sign's teal colour and lettering; the full sign photo is not used as a
website logo. Owner approval of the approximation is still needed.

Locally hosted illustrative photography downloaded from Unsplash:

| File | Source |
| --- | --- |
| `static/images/hero-om.jpg` | Supplied by the client (golden-hour Om meditation terrace, from the redesign mockup). Converted from PNG to JPEG, 2000px wide. |
| `static/images/hero.jpg` | https://images.unsplash.com/photo-1544367567-0f2fcb009e0b |
| `static/images/yoga.jpg` | https://images.unsplash.com/photo-1506126613408-eca07ce68773 |
| `static/images/dance.jpg` | https://images.unsplash.com/photo-1518611012118-696072aa579a |
| `static/images/fitness.jpg` | https://images.unsplash.com/photo-1517836357463-d25dfeac3438 |
| `static/images/about.jpg` | https://images.unsplash.com/photo-1545205597-3d9d02c29597 |

Self-hosted webfonts (Google Fonts, latin subsets, variable):

| File | Family |
| --- | --- |
| `static/fonts/source-serif-4-var-latin.woff2` | Source Serif 4 (weights 200–900, optical size axis) |
| `static/fonts/inter-var-latin.woff2` | Inter (weights 100–900) |

`hero.jpg` is no longer referenced by the landing page hero (replaced by the
client-supplied `hero-om.jpg`) but is kept in case the About/program sections
want it later.

These are mood/subject images, not verified photographs of Shailja’s team,
premises or customers. Review asset suitability and licensing for launch:
https://unsplash.com/license. Replace them with approved business photography
when available. No remote image requests are made by visitors.

## BP wellness pose illustrations

The ten SVGs in `public/images/poses/` are original, project-created illustrations,
not downloaded or traced from third-party images. They are dedicated under
**CC0-1.0** (https://creativecommons.org/publicdomain/zero/1.0/); no third-party
attribution is required. Each pose record in the versioned Convex seed includes
its local image path, descriptive alt text, license declaration, and fallback path.

`fallback.svg` depicts a neutral book, not a replacement pose. The UI changes alt
text when a pose image fails. Simplified illustrations are not anatomical
instruction: a healthcare professional and qualified yoga instructor must review
the depictions together with the steps and safety notes before public launch.
