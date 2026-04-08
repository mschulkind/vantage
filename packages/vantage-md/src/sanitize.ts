/**
 * Sanitization schema for the rendering pipeline.
 * Allows GFM, KaTeX MathML, syntax highlighting classes, and
 * data-source-line attributes while blocking XSS vectors.
 */

import { defaultSchema } from "rehype-sanitize";

type Schema = typeof defaultSchema;

export const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // KaTeX MathML elements
    "math",
    "semantics",
    "mrow",
    "mi",
    "mo",
    "mn",
    "msup",
    "msub",
    "mfrac",
    "mover",
    "munder",
    "msqrt",
    "mroot",
    "mtable",
    "mtr",
    "mtd",
    "mtext",
    "mspace",
    "annotation",
    // Other
    "figure",
    "figcaption",
    "summary",
    "details",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] || []),
      "className",
      "style",
      "dataSourceLine",
    ],
    code: [...(defaultSchema.attributes?.code || []), "className"],
    span: [...(defaultSchema.attributes?.span || []), "className", "style"],
    div: [...(defaultSchema.attributes?.div || []), "className", "style"],
    a: [...(defaultSchema.attributes?.a || []), "id", "className"],
    math: ["xmlns"],
    annotation: ["encoding"],
    img: [...(defaultSchema.attributes?.img || []), "loading"],
    td: [...(defaultSchema.attributes?.td || []), "style"],
    th: [...(defaultSchema.attributes?.th || []), "style"],
  },
};
