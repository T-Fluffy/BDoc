using System.Net;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace BDoc.Services;

/// <summary>
/// Converts a WordprocessingML (.docx) package into TipTap-compatible HTML while
/// preserving fonts, font sizes, colors, highlight, bold/italic/underline/strike,
/// alignment, lists, tables, images and hyperlinks.
/// </summary>
public static class DocxToHtmlService
{
    public static string Convert(byte[] docxBytes)
    {
        using var ms = new MemoryStream(docxBytes);
        using var doc = WordprocessingDocument.Open(ms, false);
        var mainPart = doc.MainDocumentPart;
        var body = mainPart?.Document?.Body;
        if (body == null) return "<p></p>";

        var numbering = ReadNumbering(mainPart!);
        var sb = new StringBuilder();
        var listStack = new List<OpenList>();

        foreach (var el in body.ChildElements)
        {
            if (el is Paragraph paragraph)
            {
                AppendParagraph(sb, paragraph, mainPart, numbering, listStack);
            }
            else if (el is Table table)
            {
                CloseLists(sb, listStack);
                sb.Append(ConvertTable(table, mainPart));
            }
        }
        CloseLists(sb, listStack);

        var html = sb.ToString();
        return string.IsNullOrWhiteSpace(html) ? "<p></p>" : html;
    }

    private sealed class OpenList
    {
        public required string Tag;
        public required int NumberId;
        public required int Level;
        public bool ItemOpen;
    }

    private static void AppendParagraph(StringBuilder sb, Paragraph paragraph, MainDocumentPart mainPart,
        NumberingInfo numbering, List<OpenList> listStack)
    {
        var pPr = paragraph.ParagraphProperties;
        var listInfo = pPr?.NumberingProperties is not null
            ? ReadListInfo(pPr, numbering)
            : null;

        if (listInfo is not null)
        {
            var (level, numberId, _) = listInfo.Value;
            var target = level + 1;

            while (listStack.Count > target)
                CloseTopList(sb, listStack);

            if (listStack.Count == 0 || listStack[^1].NumberId != numberId)
            {
                while (listStack.Count > Math.Max(0, target - 1))
                    CloseTopList(sb, listStack);
                OpenListAt(sb, listStack, numberId, level, numbering);
            }
            else
            {
                while (listStack.Count < target)
                    OpenListAt(sb, listStack, numberId, listStack.Count, numbering);
            }

            if (listStack[^1].ItemOpen) sb.Append("</li>");
            listStack[^1].ItemOpen = true;
            sb.Append("<li>");
            sb.Append(ConvertParagraphInner(paragraph, mainPart));
            return;
        }

        CloseLists(sb, listStack);
        sb.Append(ConvertStandaloneParagraph(paragraph, mainPart));
    }

    private static void OpenListAt(StringBuilder sb, List<OpenList> listStack, int numberId, int level, NumberingInfo numbering)
    {
        var isOrdered = IsOrderedLevel(numberId, level, numbering);
        listStack.Add(new OpenList { Tag = isOrdered ? "ol" : "ul", NumberId = numberId, Level = level });
        sb.Append($"<{listStack[^1].Tag}>");
    }

    private static void CloseTopList(StringBuilder sb, List<OpenList> listStack)
    {
        var top = listStack[^1];
        if (top.ItemOpen) sb.Append("</li>");
        sb.Append($"</{top.Tag}>");
        listStack.RemoveAt(listStack.Count - 1);
    }

    private static void CloseLists(StringBuilder sb, List<OpenList> listStack)
    {
        while (listStack.Count > 0)
            CloseTopList(sb, listStack);
    }

    private static string ConvertStandaloneParagraph(Paragraph paragraph, MainDocumentPart mainPart)
    {
        var (tag, style) = GetParagraphTagAndStyle(paragraph);
        var attrs = style.Length > 0 ? $" style=\"{style}\"" : "";
        var inner = ConvertParagraphInner(paragraph, mainPart);
        return $"<{tag}{attrs}>{inner}</{tag}>";
    }

    private static string ConvertParagraphInner(Paragraph paragraph, MainDocumentPart mainPart)
    {
        var sb = new StringBuilder();
        foreach (var child in paragraph.ChildElements)
        {
            if (child is Run run)
                sb.Append(ConvertRun(run, mainPart));
            else if (child is Hyperlink hyperlink)
                sb.Append(ConvertHyperlink(hyperlink, mainPart));
            else if (child is DocumentFormat.OpenXml.Wordprocessing.BookmarkStart or
                     DocumentFormat.OpenXml.Wordprocessing.BookmarkEnd or
                     DocumentFormat.OpenXml.Wordprocessing.CommentRangeStart or
                     DocumentFormat.OpenXml.Wordprocessing.CommentRangeEnd)
                continue;
            else if (child is ParagraphProperties or DocumentFormat.OpenXml.Wordprocessing.SectionProperties)
                continue;
        }
        return sb.ToString();
    }

    private static (string Tag, string Style) GetParagraphTagAndStyle(Paragraph paragraph)
    {
        var pPr = paragraph.ParagraphProperties;
        var styles = new List<string>();

        if (pPr?.Justification?.Val is not null)
        {
            var align = pPr.Justification.Val.InnerText switch
            {
                "center" => "center",
                "right" => "right",
                "both" => "justify",
                "distribute" => "justify",
                _ => null
            };
            if (align is not null) styles.Add($"text-align: {align}");
        }

        if (pPr?.Indentation is not null)
        {
            var ind = pPr.Indentation;
            if (TryTwipsToPoints(ind.Left, out var left))
                styles.Add($"margin-left: {left}pt");
            if (TryTwipsToPoints(ind.FirstLine, out var firstLine))
                styles.Add($"text-indent: {firstLine}pt");
            if (TryTwipsToPoints(ind.Hanging, out var hanging))
                styles.Add($"text-indent: -{hanging}pt");
        }

        var styleId = pPr?.ParagraphStyleId?.Val?.Value ?? "";
        var tag = GetHeadingTag(styleId);
        var style = string.Join("; ", styles);
        return (tag, style);
    }

    private static string GetHeadingTag(string styleId)
    {
        var lower = styleId.ToLowerInvariant();
        if (lower.Contains("title")) return "h1";
        if (lower.Contains("subtitle")) return "h2";
        foreach (var level in Enumerable.Range(1, 6))
        {
            if (lower.Contains($"heading{level}"))
                return $"h{level}";
        }
        return "p";
    }

    private static string ConvertRun(Run run, MainDocumentPart mainPart)
    {
        var rPr = run.RunProperties;
        var open = new StringBuilder();
        var close = new StringBuilder();
        var styles = new List<string>();

        if (rPr?.RunFonts is not null)
        {
            var font = rPr.RunFonts.Ascii?.Value ?? rPr.RunFonts.HighAnsi?.Value;
            if (!string.IsNullOrWhiteSpace(font)) styles.Add($"font-family: {CssEscape(font)}");
        }

        if (rPr?.FontSize is not null && int.TryParse(rPr.FontSize.Val?.Value, out var halfPoints) && halfPoints > 0)
        {
            styles.Add($"font-size: {halfPoints / 2.0:0.#}pt");
        }

        if (rPr?.Color?.Val?.Value is { Length: > 0 } color && color != "auto")
        {
            styles.Add($"color: #{color}");
        }

        if (rPr?.Highlight?.Val is not null)
        {
            var hl = rPr.Highlight.Val.InnerText;
            if (!string.IsNullOrEmpty(hl) && !hl.Equals("none", StringComparison.OrdinalIgnoreCase)
                && !hl.Equals("auto", StringComparison.OrdinalIgnoreCase))
            {
                open.Append($"<mark style=\"background-color: {hl}\">");
                close.Insert(0, "</mark>");
            }
        }

        if (rPr?.Bold is not null && rPr.Bold.Val?.Value != false)
        {
            open.Append("<strong>");
            close.Insert(0, "</strong>");
        }
        if (rPr?.Italic is not null && rPr.Italic.Val?.Value != false)
        {
            open.Append("<em>");
            close.Insert(0, "</em>");
        }
        if (rPr?.Underline is not null && rPr.Underline.Val?.Value.ToString() != "none")
        {
            open.Append("<u>");
            close.Insert(0, "</u>");
        }
        if (rPr?.Strike is not null && rPr.Strike.Val?.Value != false)
        {
            open.Append("<s>");
            close.Insert(0, "</s>");
        }
        if (rPr?.VerticalTextAlignment?.Val?.Value.ToString() is { } va && va == "superscript")
        {
            open.Append("<sup>");
            close.Insert(0, "</sup>");
        }
        else if (rPr?.VerticalTextAlignment?.Val?.Value.ToString() is { } vs && vs == "subscript")
        {
            open.Append("<sub>");
            close.Insert(0, "</sub>");
        }

        var spanAttr = styles.Count > 0 ? $" style=\"{string.Join("; ", styles)}\"" : "";
        var inner = new StringBuilder();
        foreach (var child in run.ChildElements)
        {
            switch (child)
            {
                case Text text:
                    inner.Append(WebUtility.HtmlEncode(text.Text));
                    break;
                case Break br when br.Type?.Value == BreakValues.Page:
                    inner.Append("<br/>");
                    break;
                case Break:
                    inner.Append("<br/>");
                    break;
                case TabChar:
                    inner.Append("&nbsp;&nbsp;&nbsp;&nbsp;");
                    break;
                case Drawing drawing:
                    inner.Append(ConvertDrawing(drawing, mainPart));
                    break;
                case LastRenderedPageBreak:
                    break;
                case SymbolChar:
                    break;
            }
        }

        var content = inner.ToString();
        if (content.Length == 0 && styles.Count > 0 && run.Elements<Text>().Any(t => !string.IsNullOrEmpty(t.Text)))
        {
            content = " ";
        }
        if (content.Length == 0) return "";

        return $"{open}<span{spanAttr}>{content}</span>{close}";
    }

    private static string ConvertHyperlink(Hyperlink hyperlink, MainDocumentPart mainPart)
    {
        var href = "#";
        if (!string.IsNullOrEmpty(hyperlink.Id))
        {
            var rel = mainPart.HyperlinkRelationships.FirstOrDefault(r => r.Id == hyperlink.Id);
            if (rel is not null && rel.IsExternal) href = WebUtility.HtmlEncode(rel.Uri.ToString());
            else if (rel is not null) href = "#" + WebUtility.HtmlEncode(rel.Uri?.OriginalString ?? "");
        }
        else if (!string.IsNullOrEmpty(hyperlink.Anchor))
        {
            href = "#" + WebUtility.HtmlEncode(hyperlink.Anchor.Value);
        }

        var inner = new StringBuilder();
        foreach (var run in hyperlink.Elements<Run>())
            inner.Append(ConvertRun(run, mainPart));
        if (inner.Length == 0) return "";
        return $"<a href=\"{href}\">{inner}</a>";
    }

    private static string ConvertDrawing(Drawing drawing, MainDocumentPart mainPart)
    {
        var blip = drawing.Descendants<DocumentFormat.OpenXml.Drawing.Blip>().FirstOrDefault();
        if (blip?.Embed?.Value is not { } embedId) return "";

        var imagePart = mainPart.GetPartById(embedId) as ImagePart;
        if (imagePart is null) return "";

        using var stream = imagePart.GetStream();
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        var base64 = System.Convert.ToBase64String(ms.ToArray());
        var mime = string.IsNullOrEmpty(imagePart.ContentType) ? "image/png" : imagePart.ContentType;

        string size = "";
        var extent = drawing.Descendants<DocumentFormat.OpenXml.Drawing.Wordprocessing.Extent>().FirstOrDefault();
        if (extent?.Cx is not null && extent.Cy is not null)
        {
            var w = Math.Max(1, (int)Math.Round(extent.Cx.Value / 9525.0));
            var h = Math.Max(1, (int)Math.Round(extent.Cy.Value / 9525.0));
            size = $" width=\"{w}\" height=\"{h}\"";
        }

        return $"<img src=\"data:{mime};base64,{base64}\"{size}/>";
    }

    private static string ConvertTable(Table table, MainDocumentPart mainPart)
    {
        var sb = new StringBuilder();
        sb.Append("<table style=\"border-collapse: collapse;\"><tbody>");
        foreach (var row in table.Elements<TableRow>())
        {
            var isHeader = row.TableRowProperties?.GetFirstChild<DocumentFormat.OpenXml.Wordprocessing.TableHeader>() is not null;
            sb.Append("<tr>");
            foreach (var cell in row.Elements<TableCell>())
            {
                var cellInner = new StringBuilder();
                foreach (var cellChild in cell.ChildElements)
                {
                    if (cellChild is Paragraph p)
                        cellInner.Append(ConvertStandaloneParagraph(p, mainPart));
                    else if (cellChild is Table nested)
                        cellInner.Append(ConvertTable(nested, mainPart));
                }
                var tag = isHeader ? "th" : "td";
                var span = "";
                if (cell.TableCellProperties?.GridSpan?.Val is { } gs) span += $" colspan=\"{gs}\"";
                if (cell.TableCellProperties?.VerticalMerge?.Val?.Value.ToString() == "restart")
                    span += " rowspan=\"0\"";
                sb.Append($"<{tag}{span} style=\"border: 1px solid #d1d5db; padding: 4px 8px;\">{cellInner}</{tag}>");
            }
            sb.Append("</tr>");
        }
        sb.Append("</tbody></table>");
        return sb.ToString();
    }

    private static string CssEscape(string value)
    {
        var v = value.Trim();
        return v.Length == 0 || char.IsLetter(v[0]) ? v : $"\"{v}\"";
    }

    private static bool TryTwipsToPoints(StringValue? twips, out double points)
    {
        points = 0;
        if (twips?.Value is not { } raw || !double.TryParse(raw, out var tw)) return false;
        if (tw <= 0) return false;
        points = tw / 20.0;
        return true;
    }

    // ---------------- Numbering ----------------

    private sealed class NumberingInfo
    {
        public Dictionary<int, int> NumToAbstract = [];
        public Dictionary<int, List<(int Level, string Format, string Text)>> AbstractLevels = [];
    }

    private static NumberingInfo ReadNumbering(MainDocumentPart mainPart)
    {
        var info = new NumberingInfo();
        var numbering = mainPart?.NumberingDefinitionsPart?.Numbering;
        if (numbering is null) return info;

        foreach (var num in numbering.Elements<NumberingInstance>())
        {
            if (num.NumberID is { } nid && int.TryParse(nid.ToString(), out var numId) &&
                num.AbstractNumId?.Val is { } aid && int.TryParse(aid.ToString(), out var absId))
                info.NumToAbstract[numId] = absId;
        }

        foreach (var abs in numbering.Elements<AbstractNum>())
        {
            if (abs.AbstractNumberId?.Value is not { } absId) continue;
            var levels = new List<(int Level, string Format, string Text)>();
            foreach (var level in abs.Elements<Level>())
            {
                if (level.LevelIndex?.Value is not { } ilvl) continue;
                var fmt = level.NumberingFormat?.Val?.InnerText ?? "decimal";
                var text = level.LevelText?.Val?.Value ?? "";
                levels.Add((ilvl, fmt, text));
            }
            info.AbstractLevels[absId] = levels;
        }
        return info;
    }

    private static (int Level, int NumberId, bool IsOrdered)? ReadListInfo(ParagraphProperties pPr, NumberingInfo numbering)
    {
        var numPr = pPr.NumberingProperties;
        if (numPr?.NumberingId?.Val is not { } numIdVal) return null;
        if (!int.TryParse(numIdVal.ToString(), out var numId) || numId == 0) return null;

        var ilvl = 0;
        if (numPr.NumberingLevelReference?.Val is { } ilvlVal)
            int.TryParse(ilvlVal.ToString(), out ilvl);

        return (Math.Min(ilvl, 5), numId, IsOrderedLevel(numId, Math.Min(ilvl, 5), numbering));
    }

    private static bool IsOrderedLevel(int numId, int ilvl, NumberingInfo numbering)
    {
        var fmt = GetFormat(numId, ilvl, numbering);
        return !string.Equals(fmt, "bullet", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(fmt, "none", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetFormat(int numId, int ilvl, NumberingInfo numbering)
    {
        if (numbering.NumToAbstract.TryGetValue(numId, out var absId) &&
            numbering.AbstractLevels.TryGetValue(absId, out var levels))
        {
            var match = levels.FirstOrDefault(l => l.Level == ilvl);
            if (match.Format is not null) return match.Format;
        }
        return "decimal";
    }
}