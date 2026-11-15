import { defineRule, eslintCompatPlugin } from "@oxlint/plugins"
import type { ESTree, SourceCode } from "@oxlint/plugins"

const tables = new Set(["library", "title", "mediaItem"])
const reads = new Set([
  "from",
  "innerJoin",
  "leftJoin",
  "rightJoin",
  "fullJoin",
])
const filters = new Set([
  "visibleLibraries",
  "visibleTitles",
  "visibleItems",
  "inLibraries",
  "inLibrariesArg",
])
const owners = new Set([
  "ExpressionStatement",
  "PropertyDefinition",
  "ReturnStatement",
  "ThrowStatement",
  "VariableDeclaration",
])

function statementOf(node: ESTree.Node): ESTree.Node {
  let current = node
  while (!owners.has(current.type) && current.parent.type !== "Program") {
    current = current.parent
  }
  return current
}

function hasAccessComment(source: SourceCode, node: ESTree.Node): boolean {
  let current = node
  while (true) {
    if (
      source
        .getCommentsBefore(current)
        .some(
          (comment) =>
            comment.end <= node.start &&
            /\bACCESS\s*:\s*\S/u.test(comment.value),
        )
    )
      return true
    if (owners.has(current.type) || current.parent.type === "Program")
      return false
    current = current.parent
  }
}

const requireAccessFilter = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require viewer access filters on request-path library reads.",
    },
    messages: {
      missing:
        "Filter this read with visibleLibraries, visibleTitles, visibleItems, inLibraries, or inLibrariesArg, or add an ACCESS: comment explaining why it needs no filter.",
    },
  },
  createOnce(context) {
    const filtered = new Set<ESTree.Node>()
    const pending: ESTree.CallExpression[] = []
    return {
      Program() {
        filtered.clear()
        pending.length = 0
      },
      CallExpression(node) {
        const { callee } = node
        if (callee.type === "Identifier" && filters.has(callee.name)) {
          filtered.add(statementOf(node))
          return
        }
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          !reads.has(callee.property.name)
        )
          return
        const table = node.arguments[0]
        if (table?.type === "Identifier" && tables.has(table.name))
          pending.push(node)
      },
      "Program:exit"() {
        for (const node of pending) {
          if (
            !filtered.has(statementOf(node)) &&
            !hasAccessComment(context.sourceCode, node)
          ) {
            context.report({ node, messageId: "missing" })
          }
        }
      },
    }
  },
})

const arbitraryFontSize = /(?:^|[\s:"'`])text-\[[\d.]+(?:px|rem)\]/u

const noArbitraryFontSize = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require font sizes from the theme, which come with an even line height.",
    },
    messages: {
      arbitrary:
        "Use a theme font size such as text-13px instead of text-[…]. An arbitrary size inherits line-height 1.5, and the fractional line box sets the text a pixel off from the icons beside it. Add a --text-* size to globals.css if none fits.",
    },
  },
  createOnce(context) {
    return {
      // The raw source, quotes and all, so only string literals can match.
      Literal(node) {
        if (arbitraryFontSize.test(node.raw ?? ""))
          context.report({ node, messageId: "arbitrary" })
      },
      TemplateElement(node) {
        if (arbitraryFontSize.test(node.value.raw))
          context.report({ node, messageId: "arbitrary" })
      },
    }
  },
})

export default eslintCompatPlugin({
  meta: { name: "matinee" },
  rules: {
    "no-arbitrary-font-size": noArbitraryFontSize,
    "require-access-filter": requireAccessFilter,
  },
})
