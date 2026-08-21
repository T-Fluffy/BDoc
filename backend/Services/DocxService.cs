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
            await converter.ParseBody(string.IsNullOrWhiteSpace(html) ? "<p></p>" : html);
            ApplyPageSettings(mainPart, settingsJson);
            mainPart.Document!.Save();
        }
        return ms.ToArray();
    }

    private static void ApplyPageSettings(MainDocumentPart mainPart, string? settingsJson)
    {
        if (string.IsNullOrWhiteSpace(settingsJson))
            return;

        PageSettings? cfg = null;
        try
        {
            cfg = JsonSerializer.Deserialize<PageSettings>(settingsJson);
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

        var marginMm = MarginMm.TryGetValue(cfg.Margins, out var m) ? m : MarginMm["normal"];
        var marginTwips = (uint)Math.Round(marginMm * 1440 / 25.4);
        var pgMar = sectPr.GetFirstChild<PageMargin>() ?? sectPr.AppendChild(new PageMargin());
        pgMar.Top = new Int32Value((int)marginTwips);
        pgMar.Bottom = new Int32Value((int)marginTwips);
        pgMar.Left = new UInt32Value(marginTwips);
        pgMar.Right = new UInt32Value(marginTwips);
    }

    public static string SanitizeFileName(string title)
    {
        var invalid = new string(Path.GetInvalidFileNameChars());
        var name = Regex.Replace(title, $"[{Regex.Escape(invalid)}]", "_").Trim();
        return string.IsNullOrWhiteSpace(name) ? "document" : name;
    }
}