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

export default eslintCompatPlugin({
  meta: { name: "matinee" },
  rules: { "require-access-filter": requireAccessFilter },
})
