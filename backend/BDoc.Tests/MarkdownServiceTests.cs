using BDoc.Services;

namespace BDoc.Tests;

public class MarkdownServiceTests
{
    [Fact]
    public void ToMarkdown_Empty_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, MarkdownService.ToMarkdown(""));
        Assert.Equal(string.Empty, MarkdownService.ToMarkdown("   "));
    }

    [Fact]
    public void ToMarkdown_HeadingsAndMarks()
    {
        var md = MarkdownService.ToMarkdown(
            "<h1>Title</h1><h3>Sub</h3><p>Hello <strong>bold</strong> and <em>ital</em> with <s>strike</s> and <code>code</code>.</p>");
        Assert.Contains("# Title", md);
        Assert.Contains("### Sub", md);
        Assert.Contains("**bold**", md);
        Assert.Contains("*ital*", md);
        Assert.Contains("~~strike~~", md);
        Assert.Contains("`code`", md);
    }

    [Fact]
    public void ToMarkdown_NestedLists()
    {
        var md = MarkdownService.ToMarkdown(
            "<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul><ol><li>First</li><li>Second</li></ol>");
        Assert.Contains("- One", md);
        Assert.Contains("- Two", md);
        Assert.Contains("  - Nested", md);
        Assert.Contains("1. First", md);
        Assert.Contains("2. Second", md);
    }

    [Fact]
    public void ToMarkdown_TaskList_KeepsBoxes()
    {
        var md = MarkdownService.ToMarkdown(
            "<ul><li><input type=\"checkbox\" checked=\"checked\" /> Done</li><li><input type=\"checkbox\" /> Open</li></ul>");
        Assert.Contains("- [x] Done", md);
        Assert.Contains("- [ ] Open", md);
    }

    [Fact]
    public void ToMarkdown_Table_BecomesGfm()
    {
        var md = MarkdownService.ToMarkdown(
            "<table><tbody><tr><td>R1C1</td><td>R1C2</td></tr><tr><td>R2C1</td><td>R2C2</td></tr></tbody></table>");
        Assert.Contains("| R1C1 | R1C2 |", md);
        Assert.Contains("| --- | --- |", md);
        Assert.Contains("| R2C1 | R2C2 |", md);
    }

    [Fact]
    public void ToMarkdown_CodeBlock_LinksQuoteRule()
    {
        var md = MarkdownService.ToMarkdown(
            "<blockquote><p>Wise words.</p></blockquote><pre><code>var x = 1;</code></pre>" +
            "<p><a href=\"https://example.com\">Link text</a></p><hr/>");
        Assert.Contains("> Wise words.", md);
        Assert.Contains("```", md);
        Assert.Contains("var x = 1;", md);
        Assert.Contains("[Link text](https://example.com)", md);
        Assert.Contains("---", md);
    }

    [Fact]
    public void ToMarkdown_PageBreak_BecomesMarker()
    {
        var md = MarkdownService.ToMarkdown(
            "<p>Before</p><div class=\"page-break\" data-page-break=\"true\"></div><p>After</p>");
        Assert.Contains(MarkdownService.PageBreakMarker, md);
        Assert.Contains("Before", md);
        Assert.Contains("After", md);
    }

    [Fact]
    public void ToMarkdown_InlineCodeWithBacktick_DoesNotCorrupt()
    {
        var md = MarkdownService.ToMarkdown("<p>Use <code>a`b</code> here.</p>");
        Assert.Contains("`` a`b ``", md);
    }

    [Fact]
    public void ToHtml_Empty_ReturnsParagraph()
    {
        Assert.Equal("<p></p>", MarkdownService.ToHtml(""));
        Assert.Equal("<p></p>", MarkdownService.ToHtml("  \n "));
    }

    [Fact]
    public void ToHtml_RichMarkdown()
    {
        var html = MarkdownService.ToHtml(
            "# Head\n\nText **b** and ~~s~~.\n\n- [x] Done\n- Open\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nvar y = 2;\n```\n");
        Assert.Contains("<h1", html);
        Assert.Contains("<strong>b</strong>", html);
        Assert.Contains("type=\"checkbox\"", html);
        Assert.Contains("<table>", html);
        Assert.Contains("language-js", html);
    }

    [Fact]
    public void RoundTrip_PageBreakMarker_Survives()
    {
        var html = "<p>A</p><div class=\"page-break\" data-page-break=\"true\" data-user-break=\"true\" style=\"height: 100px\"></div><p>B</p>";
        var md = MarkdownService.ToMarkdown(html);
        var back = MarkdownService.ToHtml(md);
        Assert.Contains("data-user-break=\"true\"", back);
        Assert.Contains("A", back);
        Assert.Contains("B", back);
    }

    [Fact]
    public void RoundTrip_TextPreserved()
    {
        var html = "<h1>H</h1><p>Keep <strong>me</strong>.</p><ul><li>Item</li></ul>";
        var back = MarkdownService.ToHtml(MarkdownService.ToMarkdown(html));
        Assert.Contains("H", back);
        Assert.Contains("Keep", back);
        Assert.Contains("<strong>me</strong>", back);
        Assert.Contains("Item", back);
    }
}
