using System.Text.Json;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using HtmlToOpenXml;

namespace BDoc.Services;

public class PageSettings
{
    public string Size { get; set; } = "A4";
    public string Orientation { get; set; } = "portrait";
    public string Margins { get; set; } = "normal";
    /// <summary>Exact margin in mm (e.g. set via the ruler); &lt;= 0 = use the preset.</summary>
    public double CustomMarginMm { get; set; }
    public HeaderFooterSettings? HeaderFooter { get; set; }
}

public class HeaderFooterContent
{
    public string Default { get; set; } = "";
    public string First { get; set; } = "";
    public string Even { get; set; } = "";
}

public class HeaderFooterSettings
{
    public HeaderFooterContent Header { get; set; } = new();
    public HeaderFooterContent Footer { get; set; } = new();
    public bool DifferentFirstPage { get; set; }
    public bool DifferentOddEven { get; set; }
    public bool PageNumbersEnabled { get; set; }
    public string PageNumberAlign { get; set; } = "center";
}

public static class DocxService
{
    private static readonly Dictionary<string, (double w, double h)> PageDimsMm = new()
    {
        ["A5"] = (148, 210),
        ["A4"] = (210, 297),
        ["A3"] = (297, 420),
        ["A2"] = (420, 594),
        ["A1"] = (594, 841),
    };

    private static readonly Dictionary<string, int> MarginMm = new()
    {
        ["narrow"] = 12,
        ["normal"] = 20,
        ["wide"] = 30,
    };

    public static async Task<byte[]> ToDocxAsync(string html, string? settingsJson = null)
    {
        using var ms = new MemoryStream();
        using (var wordDoc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var mainPart = wordDoc.AddMainDocumentPart();
            var converter = new HtmlConverter(mainPart);
            converter.ImageProcessing = ImageProcessingMode.Embed;
            // User-inserted page breaks become real Word page breaks (an empty
            // paragraph carrying page-break-after survives conversion cleanly).
            var bodyHtml = Regex.Replace(
                string.IsNullOrWhiteSpace(html) ? "<p></p>" : html,
                @"<div\b[^>]*\bdata-user-break\s*=\s*(""true""|'true')[^>]*>.*?</div>",
                "<p style=\"page-break-after: always;\"></p>",
                RegexOptions.IgnoreCase | RegexOptions.Singleline);
            // Tab stops: collect per-block positions (document order) and mark
            // each tabbed block with an invisible marker run; the stops are
            // written as real w:tabs after conversion (converter ignores them).
            var tabStops = new List<List<double>>();
            bodyHtml = Regex.Replace(
                bodyHtml,
                @"<(p|h[1-6])\b([^>]*\bdata-tab-stops\s*=\s*""([^""]*)""[^>]*)>",
                m =>
                {
                    var nums = m.Groups[3].Value.Split(',')
                        .Select(s => double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : double.NaN)
                        .Where(double.IsFinite)
                        .ToList();
                    tabStops.Add(nums);
                    return m.Value + "<span>" + (char)0x200B + (char)0x200C + "</span>";
                },
                RegexOptions.IgnoreCase);
            await converter.ParseBody(bodyHtml);
        ApplyPageSettings(mainPart, settingsJson);
        ApplyTabStops(mainPart, tabStops);
        mainPart.Document!.Save();
    }
    return ms.ToArray();
}

    /// <summary>
    /// Writes collected tab stops as real w:tabs. Marker runs (invisible
    /// ZWSP+ZWNJ text injected before conversion) identify tabbed paragraphs
    /// in document order; markers are removed so Word shows nothing extra.
    /// Positions are mm from the content area == twips from the margin.
    /// </summary>
    private static void ApplyTabStops(MainDocumentPart mainPart, List<List<double>> tabStops)
    {
        if (tabStops.Count == 0) return;
        int k = 0;
        foreach (var para in mainPart.Document!.Body!.Descendants<Paragraph>().ToList())
        {
            var marker = para.Descendants<Text>().FirstOrDefault(t => (t.Text ?? "").Contains("\u200B\u200C"));
            if (marker is null) continue;
            if (k >= tabStops.Count) break;
            var stops = tabStops[k++];
            var run = marker.Parent as Run;
            marker.Text = (marker.Text ?? "").Replace("\u200B\u200C", "");
            if (string.IsNullOrEmpty(marker.Text))
            {
                marker.Remove();
                if (run is not null && run.ChildElements.Count == 0) run.Remove();
            }
            if (stops.Count == 0) continue;
            var pPr = para.GetFirstChild<ParagraphProperties>() ?? para.PrependChild(new ParagraphProperties());
            pPr.AppendChild(new Tabs(stops.Select(s => new TabStop
            {
                Val = TabStopValues.Left,
                Position = (int)Math.Round(s * 1440 / 25.4),
            })));
        }
    }

    private static void ApplyPageSettings(MainDocumentPart mainPart, string? settingsJson)
    {
        if (string.IsNullOrWhiteSpace(settingsJson))
            return;

        PageSettings? cfg = null;
        try
        {
            // Frontend sends camelCase — bind case-insensitively.
            cfg = JsonSerializer.Deserialize<PageSettings>(settingsJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return;
        }
        if (cfg is null)
            return;

        var body = mainPart.Document?.Body;
        if (body is null)
            return;

        var dims = PageDimsMm.TryGetValue(cfg.Size, out var d) ? d : PageDimsMm["A4"];
        double w = dims.w;
        double h = dims.h;
        bool landscape = string.Equals(cfg.Orientation, "landscape", StringComparison.OrdinalIgnoreCase);
        if (landscape)
            (w, h) = (h, w);

        var sectPr = body.GetFirstChild<SectionProperties>() ?? body.AppendChild(new SectionProperties());
        var pageSz = sectPr.GetFirstChild<PageSize>() ?? sectPr.AppendChild(new PageSize());
        pageSz.Width = new UInt32Value((uint)Math.Round(w * 1440 / 25.4));
        pageSz.Height = new UInt32Value((uint)Math.Round(h * 1440 / 25.4));
        pageSz.Orient = landscape ? PageOrientationValues.Landscape : PageOrientationValues.Portrait;

        var marginMm = cfg.CustomMarginMm > 0
            ? Math.Clamp(cfg.CustomMarginMm, 0, 50)
            : MarginMm.TryGetValue(cfg.Margins, out var m) ? m : MarginMm["normal"];
        var marginTwips = (uint)Math.Round(marginMm * 1440 / 25.4);
        var pgMar = sectPr.GetFirstChild<PageMargin>() ?? sectPr.AppendChild(new PageMargin());
        pgMar.Top = new Int32Value((int)marginTwips);
        pgMar.Bottom = new Int32Value((int)marginTwips);
        pgMar.Left = new UInt32Value(marginTwips);
        pgMar.Right = new UInt32Value(marginTwips);

        ApplyHeaderFooter(mainPart, sectPr, cfg.HeaderFooter);
    }

    /// <summary>
    /// Emits real OOXML header/footer parts (default/first/even) plus a
    /// "Page X of Y" field paragraph in each footer when page numbers are on.
    /// Variant texts fall back to the default text when empty (same rule as
    /// the frontend overlay), so only non-empty variants get their own part.
    /// </summary>
    private static void ApplyHeaderFooter(MainDocumentPart mainPart, SectionProperties sectPr, HeaderFooterSettings? hf)
    {
        if (hf is null)
            return;

        var headerFor = new Func<int, string>(page =>
            page == 1 && hf.DifferentFirstPage && !string.IsNullOrWhiteSpace(hf.Header.First) ? hf.Header.First
            : page % 2 == 0 && hf.DifferentOddEven && !string.IsNullOrWhiteSpace(hf.Header.Even) ? hf.Header.Even
            : hf.Header.Default);
        var footerFor = new Func<int, string>(page =>
            page == 1 && hf.DifferentFirstPage && !string.IsNullOrWhiteSpace(hf.Footer.First) ? hf.Footer.First
            : page % 2 == 0 && hf.DifferentOddEven && !string.IsNullOrWhiteSpace(hf.Footer.Even) ? hf.Footer.Even
            : hf.Footer.Default);

        // Collect the distinct (kind, variant) parts actually needed.
        var headerParts = new Dictionary<string, string>();
        var footerParts = new Dictionary<string, string>();
        if (!string.IsNullOrWhiteSpace(headerFor(1)) || !string.IsNullOrWhiteSpace(headerFor(2)) || !string.IsNullOrWhiteSpace(headerFor(3)))
        {
            headerParts["default"] = headerFor(3);
            if (hf.DifferentFirstPage && !string.IsNullOrWhiteSpace(hf.Header.First)) headerParts["first"] = hf.Header.First;
            if (hf.DifferentOddEven && !string.IsNullOrWhiteSpace(hf.Header.Even)) headerParts["even"] = hf.Header.Even;
        }
        bool wantFooterText = !string.IsNullOrWhiteSpace(footerFor(1)) || !string.IsNullOrWhiteSpace(footerFor(2)) || !string.IsNullOrWhiteSpace(footerFor(3));
        bool hasFirstFooter = !string.IsNullOrWhiteSpace(hf.Footer.First);
        bool hasEvenFooter = !string.IsNullOrWhiteSpace(hf.Footer.Even);
        if (wantFooterText || hf.PageNumbersEnabled)
        {
            footerParts["default"] = footerFor(3);
            // Variant parts created only for page numbers carry no baked-in
            // fallback text — import then round-trips clean data.
            if (hf.DifferentFirstPage && (hasFirstFooter || hf.PageNumbersEnabled))
                footerParts["first"] = hasFirstFooter ? hf.Footer.First : "";
            if (hf.DifferentOddEven && (hasEvenFooter || hf.PageNumbersEnabled))
                footerParts["even"] = hasEvenFooter ? hf.Footer.Even : "";
        }
        if (headerParts.Count == 0 && footerParts.Count == 0)
            return;

        if (hf.DifferentFirstPage && sectPr.GetFirstChild<TitlePage>() is null)
            sectPr.AppendChild(new TitlePage());
        if (hf.DifferentOddEven && sectPr.GetFirstChild<EvenAndOddHeaders>() is null)
            sectPr.AppendChild(new EvenAndOddHeaders());

        JustificationValues pnAlign = hf.PageNumberAlign switch
        {
            "left" => JustificationValues.Left,
            "right" => JustificationValues.Right,
            _ => JustificationValues.Center,
        };

        foreach (var kv in headerParts)
        {
            var part = mainPart.AddNewPart<HeaderPart>();
            part.Header = new Header(MakeTextParagraphs(kv.Value));
            part.Header.Save();
            sectPr.AppendChild(new HeaderReference
            {
                Type = kv.Key switch
                {
                    "first" => HeaderFooterValues.First,
                    "even" => HeaderFooterValues.Even,
                    _ => HeaderFooterValues.Default,
                },
                Id = mainPart.GetIdOfPart(part),
            });
        }

        foreach (var kv in footerParts)
        {
            var part = mainPart.AddNewPart<FooterPart>();
            var children = new List<OpenXmlElement>();
            if (!string.IsNullOrWhiteSpace(kv.Value)) children.AddRange(MakeTextParagraphs(kv.Value));
            if (hf.PageNumbersEnabled)
                children.Add(MakePageNumberParagraph(pnAlign));
            part.Footer = new Footer(children);
            part.Footer.Save();
            sectPr.AppendChild(new FooterReference
            {
                Type = kv.Key switch
                {
                    "first" => HeaderFooterValues.First,
                    "even" => HeaderFooterValues.Even,
                    _ => HeaderFooterValues.Default,
                },
                Id = mainPart.GetIdOfPart(part),
            });
        }
    }

    private static IEnumerable<OpenXmlElement> MakeTextParagraphs(string text)
    {
        var lines = text.Replace("\r\n", "\n").Split('\n');
        foreach (var line in lines)
        {
            var run = new Run(new Text(line) { Space = SpaceProcessingModeValues.Preserve });
            yield return new Paragraph(run);
        }
    }

    /// <summary>Paragraph rendering "Page [PAGE] of [NUMPAGES]" as live fields.</summary>
    private static Paragraph MakePageNumberParagraph(JustificationValues align)
    {
        var para = new Paragraph(
            new ParagraphProperties(new Justification { Val = align }),
            new Run(new Text("Page ") { Space = SpaceProcessingModeValues.Preserve }),
            new SimpleField(
                new Run(new Text("1")))
            { Instruction = " PAGE " },
            new Run(new Text(" of ") { Space = SpaceProcessingModeValues.Preserve }),
            new SimpleField(
                new Run(new Text("1")))
            { Instruction = " NUMPAGES " });
        return para;
    }

    public static string SanitizeFileName(string title)
    {
        var invalid = new string(Path.GetInvalidFileNameChars());
        var name = Regex.Replace(title, $"[{Regex.Escape(invalid)}]", "_").Trim();
        return string.IsNullOrWhiteSpace(name) ? "document" : name;
    }
}