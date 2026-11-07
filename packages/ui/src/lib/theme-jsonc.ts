/**
 * VS Code themes are JSONC: comments and trailing commas are allowed. Strings
 * are copied verbatim, so `//` or `,]` inside a value survives.
 */
export function stripJsonComments(text: string): string {
  let output = ""
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '"') {
      let end = index + 1
      while (end < text.length && text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1
      }
      output += text.slice(index, end + 1)
      index = end + 1
      continue
    }
    const afterComment = skipJsonComment(text, index)
    if (afterComment !== index) {
      index = afterComment
      continue
    }
    if (char === ",") {
      // A trailing comma: the next token closes the object or array.
      const closer = text[skipJsonSpace(text, index + 1)]
      if (closer !== "}" && closer !== "]") output += char
    } else {
      output += char
    }
    index += 1
  }
  return output
}

/** Where the text continues after whitespace and comments from `index`. */
function skipJsonSpace(text: string, index: number): number {
  let next = index
  while (next < text.length) {
    const afterComment = skipJsonComment(text, next)
    if (afterComment !== next) next = afterComment
    else if (/\s/.test(text[next] ?? "")) next += 1
    else break
  }
  return next
}

/** Where the text continues after a comment at `index`, or `index` itself. */
function skipJsonComment(text: string, index: number): number {
  if (text[index] !== "/") return index
  if (text[index + 1] === "/") {
    const end = text.indexOf("\n", index)
    return end === -1 ? text.length : end
  }
  if (text[index + 1] === "*") {
    const end = text.indexOf("*/", index + 2)
    return end === -1 ? text.length : end + 2
  }
  return index
}
