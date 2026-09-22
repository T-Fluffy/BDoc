using System.Text;
using AngleSharp.Dom;
using AngleSharp.Html.Parser;
using Markdig;

namespace BDoc.Services;

/// <summary>
/// Converts between TipTap HTML and GitHub-flavored Markdown.
/// Import (markdown to HTML) uses Markdig; export (HTML to markdown) walks
/// the AngleSharp DOM and emits GFM. Styles without a Markdown equivalent
/// (colors, underline, alignment) are dropped to plain text.
/// </summary>
public static class MarkdownService
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .Build();

    /// <summary>Marker round-tripped for user page breaks (Markdown has no native break).</summary>
    public const string PageBreakMarker = "<!-- page-break -->";

    private const string PageBreakDiv =
        "<div class=\"page-break\" data-page-break=\"true\" data-user-break=\"true\" style=\"height: 100px\"></div>";

    public static string ToHtml(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown)) return "<p></p>";
        var html = Markdig.Markdown.ToHtml(markdown, Pipeline);
        if (string.IsNullOrWhiteSpace(html)) return "<p></p>";
        // Restore user page breaks lost to Markdown's lack of a break construct.
        html = html.Replace(PageBreakMarker, PageBreakDiv, StringComparison.Ordinal);
        return html.Trim();
    }

    public static string ToMarkdown(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;
        var parser = new HtmlParser();
        var doc = parser.ParseDocument(html);
        var sb = new StringBuilder();
        foreach (var node in doc.Body!.ChildNodes)
            AppendBlock(sb, node, 0);
        return sb.ToString().Trim() + "\n";
    }

    private static void AppendBlock(StringBuilder sb, INode node, int listDepth)
    {
        if (node.NodeType == NodeType.Text)
        {
            var t = Collapse(node.TextContent ?? string.Empty);
            if (!string.IsNullOrWhiteSpace(t)) sb.Append(EscapeInline(t)).Append("\n\n");
            return;
        }
        if (node is not IElement el) return;
        var tag = el.TagName.ToUpperInvariant();

        // User page breaks have no Markdown form; keep them as a marker comment.
        if (tag == "DIV" && el.ClassList.Contains("page-break"))
        {
            sb.Append(PageBreakMarker).Append("\n\n");
            return;
        }
        if (tag.Length == 2 && tag[0] == 'H' && tag[1] is >= '1' and <= '6')
        {
            sb.Append(new string('#', tag[1] - '0')).Append(' ').Append(Inline(el).Trim()).Append("\n\n");
            return;
        }
        switch (tag)
        {
            case "P":
                var inner = Inline(el).Trim();
                if (inner.Length > 0) sb.Append(inner).Append("\n\n");
                break;
            case "UL":
            case "OL":
                AppendList(sb, el, listDepth, tag == "OL");
                sb.Append("\n");
                break;
            case "BLOCKQUOTE":
                foreach (var line in Inline(el).Trim().Split('\n'))
                    sb.Append("> ").Append(line.Trim()).Append("\n");
                sb.Append("\n");
                break;
            case "PRE":
                sb.Append("```\n").Append(el.TextContent.Trim('\n')).Append("\n```\n\n");
                break;
            case "HR":
                sb.Append("---\n\n");
                break;
            case "TABLE":
                AppendTable(sb, el);
                break;
            case "BR":
                sb.Append("  \n");
                break;
            default:
                // Unknown wrappers (spans, divs, comments): descend.
                foreach (var child in el.ChildNodes)
                    AppendBlock(sb, child, listDepth);
                break;
        }
    }

    private static void AppendList(StringBuilder sb, IElement list, int depth, bool ordered)
    {
        var indent = new string(' ', depth * 2);
        var i = 0;
        foreach (var child in list.Children.Where(c => c.TagName.Equals("LI", StringComparison.OrdinalIgnoreCase)))
        {
            i++;
            var prefix = ordered ? $"{i}. " : "- ";
            var box = TaskBox(child);
            if (box is not null) prefix = box;
            // Inline content first, then any nested lists on following lines.
            var inline = new StringBuilder();
            var nested = new List<IElement>();
            foreach (var c in child.ChildNodes)
            {
                if (c is IElement e && (e.TagName.Equals("UL", StringComparison.OrdinalIgnoreCase) || e.TagName.Equals("OL", StringComparison.OrdinalIgnoreCase)))
                    nested.Add(e);
                else
                    inline.Append(InlineNode(c));
            }
            sb.Append(indent).Append(prefix).Append(inline.ToString().Trim()).Append("\n");
            foreach (var n in nested)
                AppendList(sb, n, depth + 1, n.TagName.Equals("OL", StringComparison.OrdinalIgnoreCase));
        }
    }

    /// <summary>Task-list marker when the item carries a checkbox, else null.</summary>
    private static string? TaskBox(IElement li)
    {
        var input = li.QuerySelector("input[type=checkbox]");
        if (input is null) return null;
        var checkedAttr = input.GetAttribute("checked");
        var dataChecked = li.GetAttribute("data-checked");
        var done = checkedAttr is not null || string.Equals(dataChecked, "true", StringComparison.OrdinalIgnoreCase);
        return done ? "- [x] " : "- [ ] ";
    }

    private static void AppendTable(StringBuilder sb, IElement table)
    {
        var rows = table.QuerySelectorAll("tr")
            .Select(tr => tr.Children
                .Where(c => c.TagName.Equals("TD", StringComparison.OrdinalIgnoreCase) || c.TagName.Equals("TH", StringComparison.OrdinalIgnoreCase))
                .Select(c => Inline(c).Trim().Replace("|", "\\|").Replace("\n", " "))
                .ToList())
            .Where(r => r.Count > 0)
            .ToList();
        if (rows.Count == 0) return;
        // First row doubles as the header (TipTap tables rarely carry TH).
        var cols = rows.Max(r => r.Count);
        static List<string> Pad(List<string> row, int cols) =>
            row.Concat(Enumerable.Repeat(string.Empty, cols - row.Count)).ToList();
        sb.Append("| ").Append(string.Join(" | ", Pad(rows[0], cols))).Append(" |\n");
        sb.Append("| ").Append(string.Join(" | ", Enumerable.Repeat("---", cols))).Append(" |\n");
        for (var r = 1; r < rows.Count; r++)
            sb.Append("| ").Append(string.Join(" | ", Pad(rows[r], cols))).Append(" |\n");
        sb.Append("\n");
    }

    private static string Inline(INode node) => InlineNode(node);

    private static string InlineNode(INode node)
    {
        if (node.NodeType == NodeType.Text) return EscapeInline(Collapse(node.TextContent ?? string.Empty));
        if (node is not IElement el) return string.Empty;
        var tag = el.TagName.ToUpperInvariant();
        switch (tag)
        {
            case "STRONG":
            case "B":
                return $"**{ChildrenInline(el).Trim()}**";
            case "EM":
            case "I":
                return $"*{ChildrenInline(el).Trim()}*";
            case "S":
            case "STRIKE":
            case "DEL":
                return $"~~{ChildrenInline(el).Trim()}~~";
            case "CODE":
                // Block-level code is handled by PRE; inline code keeps raw text
                // (escapes would render literally inside code spans).
                if (el.ParentElement?.TagName.Equals("PRE", StringComparison.OrdinalIgnoreCase) == true)
                    return el.TextContent;
                var code = Collapse(el.TextContent);
                return code.Contains('`') ? $"`` {code} ``" : $"`{code}`";
            case "A":
                var href = el.GetAttribute("href") ?? string.Empty;
                var label = ChildrenInline(el).Trim();
                return string.IsNullOrEmpty(href) || label == href ? label : $"[{label}]({href})";
            case "IMG":
                return $"![{el.GetAttribute("alt") ?? string.Empty}]({el.GetAttribute("src") ?? string.Empty})";
            case "BR":
                return "  \n";
            case "UL":
            case "OL":
                // Nested list inside a paragraph context: drop to block form.
                var nested = new StringBuilder();
                AppendList(nested, el, 0, tag == "OL");
                return "\n" + nested.ToString().TrimEnd();
            case "INPUT":
                // Task-list checkbox itself carries no text.
                return string.Empty;
            case "LABEL":
                // TipTap wraps task content oddly; keep text, drop the box.
                return el.QuerySelector("div") is { } div ? ChildrenInline(div) : ChildrenInline(el);
            default:
                return ChildrenInline(el);
        }
    }

    private static string ChildrenInline(IElement el)
    {
        var sb = new StringBuilder();
        foreach (var child in el.ChildNodes)
            sb.Append(InlineNode(child));
        return sb.ToString();
    }

    private static string Collapse(string s) =>
        System.Text.RegularExpressions.Regex.Replace(s.Replace('\u00a0', ' '), @"\s+", " ");

    private static string EscapeInline(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var c in s)
        {
            if (c is '*' or '_' or '[' or ']' or '`' or '\\' or '<' or '>') sb.Append('\\');
            sb.Append(c);
        }
        return sb.ToString();
    }
}
