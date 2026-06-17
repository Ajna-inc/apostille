# Demo portrait images

These three JPEGs are used only for the public ESSI Studio OID4VC/OID4VP demo
to populate the `picture` claim on SD-JWT VCs and the `portrait` element on
mDL credentials.

## Source

All three faces are AI-generated via StyleGAN from
[thispersondoesnotexist.com](https://thispersondoesnotexist.com). They do not
depict real persons.

## License

StyleGAN-generated faces are not subject to copyright (no human author per
17 U.S.C. § 102) and are widely treated as effectively public domain /
CC0 for demo / fixture use.

## Processing

Each file is the result of:

```
sips -Z 128 input.jpg -s formatOptions 70
```

(128 px on the long side, JPEG quality 70.) Files are 5–6 KB each so the
total embedded payload across the demo credentials stays well below 25 KB.
