using System.Text.RegularExpressions;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using HtmlToOpenXml;

namespace BDoc.Services;

public static class DocxService
{
    public static async Task<byte[]> ToDocxAsync(string html)
    {
        using var ms = new MemoryStream();
        using (var wordDoc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var mainPart = wordDoc.AddMainDocumentPart();
            var converter = new HtmlConverter(mainPart);
            converter.ImageProcessing = ImageProcessingMode.Embed;
            await converter.ParseBody(string.IsNullOrWhiteSpace(html) ? "<p></p>" : html);
            mainPart.Document!.Save();
        }
        return ms.ToArray();
    }

    public static string SanitizeFileName(string title)
    {
        var invalid = new string(Path.GetInvalidFileNameChars());
        var name = Regex.Replace(title, $"[{Regex.Escape(invalid)}]", "_").Trim();
        return string.IsNullOrWhiteSpace(name) ? "document" : name;
    }
}