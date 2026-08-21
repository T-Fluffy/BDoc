namespace BDoc.Domain.Entities;

public class Document
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? Settings { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}