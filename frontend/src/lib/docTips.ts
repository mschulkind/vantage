/**
 * Analyze markdown content and suggest improvements for agent-generated docs.
 * Each tip includes a short message and a category for the style guide.
 */

export interface DocTip {
  id: string;
  message: string;
  /** Which style guide section addresses this */
  guideSection: string;
}

export function analyzeDoc(content: string): DocTip[] {
  const tips: DocTip[] = [];
  const lines = content.split("\n");

  // No headings at all
  const hasHeadings = lines.some((l) => /^#{1,6}\s/.test(l));
  if (!hasHeadings && lines.length > 20) {
    tips.push({
      id: "no-headings",
      message:
        "This document has no headings — structured docs are easier to navigate and link to.",
      guideSection: "structure",
    });
  }

  // Code blocks without language tags
  const fencedBlocks = lines.filter((l) => /^```/.test(l.trim()));
  if (fencedBlocks.length >= 2) {
    const openingFences = fencedBlocks.filter((_, i) => i % 2 === 0);
    const untaggedOpening = openingFences.filter(
      (l) => l.trim() === "```" || l.trim() === "````",
    );
    if (untaggedOpening.length > 0) {
      tips.push({
        id: "untagged-code",
        message: `${untaggedOpening.length} code block${untaggedOpening.length > 1 ? "s" : ""} without a language tag — adding one enables syntax highlighting.`,
        guideSection: "code-blocks",
      });
    }
  }

  // Very long paragraphs (wall of text)
  let longParaCount = 0;
  let currentPara = "";
  for (const line of lines) {
    if (line.trim() === "") {
      if (currentPara.length > 800) longParaCount++;
      currentPara = "";
    } else {
      currentPara += " " + line;
    }
  }
  if (currentPara.length > 800) longParaCount++;
  if (longParaCount >= 2) {
    tips.push({
      id: "long-paragraphs",
      message:
        "Some very long paragraphs — breaking them up with headings or lists improves readability.",
      guideSection: "structure",
    });
  }

  // No links in a long doc (agents often write flat text)
  const hasLinks = /\[.+?\]\(.+?\)/.test(content);
  if (!hasLinks && lines.length > 50) {
    tips.push({
      id: "no-links",
      message:
        "No cross-references or links — linking related docs with line anchors (#L42) helps navigation.",
      guideSection: "line-anchors",
    });
  }

  return tips;
}
