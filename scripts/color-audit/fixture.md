---
type: fixture
model: audit-harness
version: 1.0
status: active
---

# Color Audit Fixture

Every markdown element dabarat renders, on one page — the eyeball companion
to `audit.py`. This first paragraph is plain body text with a [link to
nowhere](https://example.com), some **bold emphasis**, some *italic
emphasis*, and `inline code` in the running line.

## Second-Level Heading

Body text continues under an h2. The paragraph passage annotated as a
comment lives here, followed by the passage annotated as a question, then
the passage annotated as a suggestion, the passage flagged important, and
finally the bookmarked passage.

### Third-Level Heading

#### Fourth-Level Heading

##### Fifth-Level Heading

###### Sixth-Level Heading

> A blockquote with *italic that must not slant* and `code that must not
> slant` — the register the Scholar's Codex pair was tuned for.
>
> > Nested blockquote, one level deeper.

## Code

Python:

```python
# A comment explaining the obvious
def greet(name: str, times: int = 3) -> list[str]:
    """Docstring string literal."""
    return [f"hello {name}" for _ in range(times)]
```

JavaScript:

```javascript
/* Block comment */
const items = data.filter(x => x.count > 0)
  .map(({ name, count }) => `${name}: ${count}`);
```

Rust:

```rust
// Line comment
fn main() -> Result<(), Box<dyn Error>> {
    let total: u64 = (1..=100).sum();
    println!("total = {total}");
    Ok(())
}
```

## Tables

| Column A | Column B | Column C |
|----------|----------|----------|
| zebra    | rows     | alternate|
| second   | row      | plain    |
| third    | row      | zebra    |
| fourth   | row      | plain    |

## Lists

- Unordered item one
- Unordered item two
  - Nested item
- Unordered item three

1. Ordered item one
2. Ordered item two

- [ ] Unchecked task
- [x] Checked task

## Template Variables

The pill for {{mustache_var}} and the pill for ${dollar_var} render inline.

## Rules and Footnotes

Some text with a footnote reference.[^1] And a second one.[^2]

---

Text after a horizontal rule.

[^1]: First footnote body with a [link](https://example.com).
[^2]: Second footnote body with `inline code`.
