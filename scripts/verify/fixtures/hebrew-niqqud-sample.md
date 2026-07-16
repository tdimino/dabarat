# עברית — Niqqud Coverage

Regression fixture for the Noto Hebrew fallback families in the font stacks
(`base-layout.css` body, heading stacks). Every context below must render the
qamats qatan (U+05C7) in בְּאׇהֳלֶךָ and קׇדְשֶׁךָ without tofu boxes — the
blockquote (italic context) is the historical failure case: Chrome routed
italic Hebrew to macOS Corsiva Hebrew, which lacks U+05C7.

Plain paragraph: יְהֹוָה מִי־יָגוּר בְּאׇהֳלֶךָ מִי־יִשְׁכֹּן בְּהַר קׇדְשֶׁךָ׃

> יְהֹוָה מִי־יָגוּר בְּאׇהֳלֶךָ מִי־יִשְׁכֹּן בְּהַר קׇדְשֶׁךָ׃ הוֹלֵךְ תָּמִים וּפֹעֵל צֶדֶק

*Emphasized:* *בְּאׇהֳלֶךָ קׇדְשֶׁךָ*

**Bold:** **בְּאׇהֳלֶךָ קׇדְשֶׁךָ**

With cantillation (Psalm 15:1): מִזְמ֥וֹר לְדָוִ֑ד יְ֭הֹוָה מִי־יָג֣וּר בְּאׇהֳלֶ֑ךָ
