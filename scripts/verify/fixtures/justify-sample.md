# The Justified Line

Long before the printing press, scribes of the great codices ruled their vellum with hairlines and squared every column by hand, stretching letterforms and swallowing spaces until each line met its margin like a wall meets its foundation. The Torah scroll, the Qur'anic mushaf, and the Book of Kells all testify to the same instinct: a block of text with even edges reads as a single woven fabric rather than a loose collection of threads, and the eye rests differently on cloth than on fringe.

Gutenberg inherited that instinct and mechanized it. His forty-two-line Bible justified every column with a system of variant letterforms and ligatures — over two hundred distinct sorts — so that the spacing would breathe evenly across the measure. What the scribes achieved with a flexible hand, the compositor achieved with a deep type case, and what the compositor achieved with patience, the modern rendering engine attempts in microseconds with far fewer tools at its disposal.

The danger of justification has always been the river: that pale vertical channel of whitespace that snakes down a paragraph when the spaces on successive lines happen to align. Rivers form when the measure is too narrow, the words too long, or the hyphenation too timid, and once seen they cannot be unseen. A well-justified paragraph therefore depends less on the alignment itself than on the quality of the line-breaking algorithm and the willingness of the typesetter to break words at syllable boundaries.

Ragged-right composition, by contrast, keeps every word space identical and lets the line ends fall where they may. Typographers of the Swiss school argued that this honesty of spacing outweighed the formality of the even margin, and most screens have followed them, because early browsers justified crudely, without hyphenation, and produced rivers wide enough to canoe down. The convention hardened into habit, and habit into an unexamined default.

Modern engines have narrowed the gap considerably. With hyphenation enabled and a reasonable measure — sixty to seventy-five characters is the classical target — a justified paragraph on screen can approach the density and calm of a printed page. The choice becomes editorial rather than technical: justification suits long, immersive reading in the manner of a book, while the ragged edge suits documentation, correspondence, and any text meant to be scanned rather than inhabited.

## What stays untouched

Headings keep their alignment, as do table cells and code:

```python
def justify(text, width):
    return "this block never justifies"
```

> Blockquotes justify along with the rest of the prose, since a quotation of any length is still a paragraph at heart, and it would look odd standing ragged inside a justified page.

- List items justify too, when they run long enough to wrap — like this one, which continues well past a single line precisely so that the alignment of its second and third lines becomes visible against the right margin of the content column.
- Short items are unaffected.
